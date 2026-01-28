const http = require('http')
const fs = require('fs')
const path = require('path')



class MsgType{
  size
  conv
  read
  constructor(size,conv,read){
    this.size = size
    this.conv = conv
    this.read = read
  }
}


class Msg{

  static type = {
  uInt64:{size:(buff)=>{return 8},conv:(num)=>{
    var buff = Buffer.allocUnsafe(8)
    buff.writeBigUInt64BE(BigInt(num),0)
    return buff
  },read:(buff)=>{
    return (new Number(buff.readBigUInt64BE(0)))+0
  }},

  uInt16:{size:(buff)=>{return 2},conv:(num)=>{
    var buff = Buffer.allocUnsafe(2)
    buff.writeUInt16BE(num,0)
    return buff
  },read:(buff)=>{
    return (new Number(buff.readUInt16BE(0)))+0
  }}

  }
  
  static types = [
    Msg.type.uInt64,
    Msg.type.uInt16,
    new MsgType((buff)=>{return Msg.type.uInt64.read(buff.subarray(0,8))+8;},(str)=>{return Buffer.concat([Msg.type.uInt64.conv(str.length),Buffer.alloc(str.length,str)])},(buff)=>{ return `${buff.subarray(8)}`}),
    new MsgType((buff)=>{return Msg.type.uInt64.read(buff.subarray(0,8))+8;},(str)=>{return Buffer.concat([Msg.type.uInt64.conv(str.length),str])},(buff)=>{ return buff.subarray(8)}),
    new MsgType((buff)=>{return 9},
    (handler)=>{
      return Buffer.concat([Msg.type.uInt64.conv(handler.id),Buffer.alloc(1,handler.decodeMsg)])
    },undefined
    ),
    new MsgType((buff)=>{return 0},undefined,(buff)=>{
      return undefined
    }),
    new MsgType(()=>{
      return 1
    },(num)=>{
      return Buffer.alloc(1,num)
    },(buff)=>{
      return buff[0]
    })
  ]


  static getTypeId(val){
    if (val == undefined){
      return 5 
    }
    if (val instanceof Handler){
      return 4
    }
    if (typeof val === 'string'){
      return 2
      
    }else if (typeof val === 'number'){
      if (val < 256 || val > -128){
        return 6
      }
      return -1
    }else if (val instanceof Buffer){
      return 3
    }
  }
  static encode(vals){
    var body = []
    //if (repeats != 1){
      //body.push(Msg.type[Msg.enums.type.uInt64].conv(repeats))
   // }
   var typeId = 0
   for (var i = 0; i < vals.length; i++){
    
    typeId = Msg.getTypeId(vals[i])
    body.push(Buffer.alloc(1,typeId))
    if (this.types[typeId].conv){
      body.push(this.types[typeId].conv(vals[i]))
    }
   
   }
   
    return Buffer.concat(body)
  }

  static decode(buff){
    var b = 0
    var size = 0
    var vals = []
    var val
    //console.log(buff)
    while (b < buff.length){
      try{
        var type = this.types[buff.subarray(b,b+1)[0]]
        b+=1
        size = type.size(buff.subarray(b))
        b+=size
        val = type.read(buff.subarray(b-size,b))
      }catch(e){
        return vals
      }
      vals.push(val)
      
    }
    return vals
  }
  static getFormatedURL(req){
    
      
    req.url = req.url.slice(1)
    var urlDataDiv = req.url.indexOf('?v=');

    //var path = req.url

    //this.urlPath = req.url.slice(1)
    //var urlData = new URLData(req.url.slice(1))
    var path = ''
    //console.log(req.url)
    if (urlDataDiv != -1){
      path = req.url.slice(0,urlDataDiv)
      req.url = req.url.slice(urlDataDiv+3)
      
       
      //path = req.url.slice(0,urlDataDiv-1)
      //req.url = req.url.slice(urlDataDiv+2)
    }else{
      path = req.url
      req.url = ''
    }
    return path
  }
  
}


class Handler{
  decodeMsg
  func;
  id;
  readyBuffer = [];
  ready = 1;
  readyWaitExpire = 0;
  constructor(id,func,decodeMsg=1,readyWait=10000){
      this.func = func
      this.decodeMsg = decodeMsg
      this.id = id
      this.readyWaitExpire = readyWait
  }
}

class HandleInfo{
  senderConnection;
  data;
  constructor(senderConnection,data){
      this.senderConnection = senderConnection
      this.data = data
  }
}


class Connection{
  socket
  handlers = new Map()
  constructor(socket,handlers=[]){
    for (var i = 0; i < handlers.length; i++){
      this.handlers.set(handlers[i].id,handlers[i])
    }
    this.socket = socket
    socket.on('message',data=>{
      if (data.length < 9){
        return
      }
      var head = data.subarray(0,1)[0]
      var handler = this.handlers.get(Msg.type.uInt64.read(data.subarray(1,9)))
      if (handler == undefined){
        return
      }
      
      if (head == 1){
        for (var i = 0; i < handler.readyBuffer.length; i++){
          this.socket.send(handler.readyBuffer[i])
        }
        handler.readyBuffer = null
        handler.ready = 1
        return
      }
      var data = data.slice(9)
      if (handler.decodeMsg == 1){
          handler.func(Msg.decode(data),new HandleInfo(this,data))
        return
      }
      handler.func(new HandleInfo(this,data))


    })

  }

  handle(id,args){
    var data = Buffer.concat([Buffer.alloc(1,0),Msg.type.uInt64.conv(id),Msg.encode(args)])
    
    var handler = this.handlers.get(id)
    if (handler.ready){
      this.socket.send(data)
      return
    }
    if (handler.readyWaitExpire < Date.now()){
      handler.ready = 1
      handler.readyBuffer = []
      return
    }
    handler.readyBuffer.push(data)
  }
  setHandler(handler){
    handler.readyWaitExpire += Date.now()
    handler.ready = 0
    this.handlers.set(handler.id,handler)
  }
  removeHandler(handler){
    this.handlers.delete(handler.id,handler)
    this.socket.send(Buffer.concat([Buffer.alloc(1,1),Msg.type.uInt64.conv(handler.id)]))
  }
}



class WebContentManager{
  files = []
  filePath
  constructor(filePath='.'){
    this.filePath = filePath+'/'
  }
  setFileResponder(res,url){
    if (fs.existsSync(this.filePath+url) == false){
      res.statusCode = 404
      res.end('File does not exist within a valid directory')
      return
    }
    var file = new WebFile(this.filePath+url)
   
    res.statusCode = 200
    res.end(file.val)

    return new HttpResponder((res)=>{
      res.statusCode = 200
      res.end(file.val)
    })
  }

}







class FileManageInfo{
  accesses = 0;
  fastAccess = 0;
  unload
  load
  onAccess = ()=>{}
  constructor(unload,load){
    this.unload = unload
    this.load = load
  }
}


class HtmlFilter{
  static clean(str){
    str.replace('<','&lt')
    str.replace('>','&gt')
    return str
  }
}

class WebFile{
  #file
  #filePath;
  fileManageInfo = new FileManageInfo(()=>{
    this.#file = null
  },()=>{
    this.#file = fs.readFileSync(this.#filePath)
  })
  set path(filePath){
    this.fileManageInfo.onAccess()
    this.#filePath = filePath
    if (this.fileManageInfo.fastAccess){
      this.#file = fs.readFileSync(filePath)
    }
  }
  get val(){
    this.fileManageInfo.onAccess()
    if (this.fileManageInfo.fastAccess){
      return this.#file
    }
    //console.log(this.#filePath)
    return fs.readFileSync(this.#filePath)
  }
  
  constructor(filePath){
    this.#filePath=filePath
  }
}






class HttpResponder{
  queue = []
  processMultiple;
  numBeingProcessed = 0
  //urlPath = ''
  //urlVal = ''
  
  call(res,req){

    if (this.maxProcesses != 0){
      this.numBeingProcessed++
      if (this.numBeingProcessed > this.maxProcesses){
        this.limitReached(res,req)
        return
      }
    }

    if (this.processMultiple){
      this.func(res,req,this)
    }else{
      if (this.queue.length == 0){
        this.func(res,req,this)
        return
      }
      this.queue.push({res:res,req:req})
    }
  }
  func
  done(){
    
    if (this.maxProcesses != 0){
      this.numBeingProcessed--
    }
    if (this.queue.length != 0){
      this.func(this.queue[0].res,this.queue[0].req,this)
      this.queue.shift()
    }   
    
  }

  static getAllReqData(req,done,maxSize = 0){
    var data = []
    req.on('data',(chunk)=>{
      if (maxSize != 0){

      }
      data.push(chunk)
    })
    req.on('end',()=>{
      done(Buffer.concat(data))
    })
  }



  limitReached(res,req){
    res.statusCode = 429
    res.end('To many requests have been sent. Please wait until they are finished.')
  }
  constructor(func,processMultiple=true,maxProcesses = 0){
      this.processMultiple = processMultiple
      this.func = func
      this.maxProcesses =maxProcesses
  }
}




class GUIElement{
  attrs = new Map()
  text=[]
  gui
  id=''
  //end
  //start
  childCount = -1
  next
  back
  child
  parent
  lastChild

  /*get next(){
    if (this.end){
      if (this.end.next){
        return this.end.next.element
      }
      return
    }
    if (this.start.next){
      return this.start.next.element
    }
  }
  get back(){
    if (this.start.back){
      return this.start.back.element
    }
  }
  get child(){
    if (this.start.next){
      return this.start.next.element
    }
  }*/
  remove(){
    this.back.next = this.next
  }
  //addElement(element){
    //element.next = this.next
    //element.parent = this
    //this.next = element
    //element.back = this
  //}
  addGUI(gui){
    gui.rootElement.lastChild.next = this.next
    gui.rootElement.child.back = this
    this.parent.childCount+=gui.rootElement.childCount
    if (this.next){
      this.next.back = gui.rootElement.lastChild
    }else{
      this.parent.lastChild = gui.rootElement.lastChild
    }
    this.next = gui.rootElement.child

  }
  tag
  constructor(tag,gui){
    //console.log(tag)
    this.tag = tag
    this.gui = gui

  }
}



class GUI{
    rootElement = new GUIElement('document',this)
    refs = new Map()
    //tags = []
    name
    
    source


    static parseScript(element,text){
      const scriptRefPattern = /"[^"]*"|'[^']*'|document\.currentScript/g
      var match = scriptRefPattern.exec(text)
      element.text = []
      while(match){
        if (match[0].charAt(0) == 'd'){
          element.text.push(text.slice(0,scriptRefPattern.lastIndex-match[0].length))
          text = text.slice(scriptRefPattern.lastIndex)
          scriptRefPattern.lastIndex = 0
        }
        match = scriptRefPattern.exec(text)
      }
      element.text.push(text)
    

    }


    clone(){

      var newGUI = new GUI('',this.name)


      newGUI.rootElement.child = new GUIElement(this.rootElement.child.tag,newGUI)


      var newElement = newGUI.rootElement.child
      newElement.parent = newGUI.rootElement

      var currentElement = this.rootElement.child
      var nextParent = false
      while(currentElement != this.rootElement){
      

        //console.log('hello')

        if (nextParent){
          
          if (currentElement.next){
            newElement.next = new GUIElement(currentElement.next.tag,newGUI)
            newElement.next.data = [...currentElement.next.data]
            newElement.next.childCount = currentElement.next.childCount
            newElement.next.parent = newElement.parent
            newElement = newElement.next

            currentElement = currentElement.next
            nextParent = false
          }else{
            newElement = newElement.parent
            currentElement = currentElement.parent
          }
        }else{
          if (currentElement.child){
            //console.log('ds',currentElement.child.tag)
            newElement.child = new GUIElement(currentElement.child.tag,newGUI)
            newElement.child.childCount = currentElement.child.childCount
            newElement.child.data = [...currentElement.child.data]
            
            newElement.child.parent = newElement

            newElement = newElement.child

            currentElement = currentElement.child
          }else{
            //currentElement = currentElement.next
            if (currentElement.next){
              newElement.next = new GUIElement(currentElement.next.tag,newGUI)
              newElement.next.data = [...currentElement.next.data]
              newElement.next.childCount = currentElement.next.childCount
              newElement.next.parent = newElement.parent
              newElement = newElement.next

              currentElement = currentElement.next
            }else{
              newElement.parent.lastChild = newElement
              //console.log(newElement.parent.lastChild.tag)
              newElement = newElement.parent

              currentElement = currentElement.parent
              nextParent = true 
            }
          }
          
          
        }
               


      }
      return newGUI
    }
    
    
    compile(){
      //var lastNode = this.rootNode.next
      var source = ''
      var nextParent = false
      var currentElement = this.rootElement.child
      var path = []
      var jsCode = ''
      var pathCode = ''
      var idPathDepths = []

      //var attrIter
      //console.log('hello')
      while(currentElement != this.rootElement){
      

        //console.log('hello')

        if (nextParent){
         
          if (currentElement.id){
            idPathDepths.pop()
            //idPathDepth = path.length
          }

          if (currentElement.tag == 'body' || currentElement.tag == 'head'){
            if (jsCode){
              source+='<script>'+jsCode+'</script>'
              jsCode = ''
            }
            
          }
         
          source+='</'+currentElement.tag+'>'
          if (currentElement.next){
            currentElement = currentElement.next
            path[path.length-1]++
            nextParent = false
          }else{
           
            path.pop()
           
            //idPathDepth--
          
            currentElement = currentElement.parent
          }
        }else{

          if (currentElement.tag == 'script' && !currentElement.attrs.get('src')){
            path[path.length-1]--
            if (idPathDepths.length){
              pathCode = '['
              for (var i = idPathDepths[idPathDepths.length-1]; i < path.length-1; i++){
                pathCode+=path[i]+','
              }
              pathCode+=path[path.length-1]+']'
              
            }else{
              pathCode = '['
              for (var i = 0; i < path.length-1; i++){
                pathCode+=path[i]+','
              }
              pathCode+=path[path.length-1]+']'
            }
            //console.log(pathCode,currentElement)
            for (var i = 0; i < currentElement.text.length-1; i++){
              jsCode+=currentElement.text[i]+pathCode
            }
            jsCode+=currentElement.text[currentElement.text.length-1]+';'
            
          }else{
            source+='<'+currentElement.tag


            if (currentElement.id){

              
            

              //console.log(idPathDepth,[...path])
              //idPathDepths.push(path.length)
              source+=' id="'
              if (currentElement.gui != this){

                source+=currentElement.gui.name+'/'
              }
              source+=currentElement.id+'"'
            }

            

            
            var attrIter = currentElement.attrs.entries()

            //console.log('dasdasdasdas')

            var pair = attrIter.next().value

            while(pair){
              source+=' '+pair[0]+'="'+pair[1]+'"'
              pair = attrIter.next().value
            }
            //for (var i= 0; i < currentElement.data.length; i++){
              //source+=' '+currentElement.data[i]
            //}
            source+='>'

          
          
            for (var i = 0; i < currentElement.text.length; i++){
              source+=currentElement.text[i]
            }
            
            
            
            if (currentElement.childCount == 0){
              source+='</'+currentElement.tag+'>'
            }
          }

          //if (currentElement.id){
            //idPathDepths.push(path.length)//path.length-1
         // }
          

           
          if (currentElement.child){
          
            if (currentElement.id){
              idPathDepths.push(path.length)//path.length-1
            }
            currentElement = currentElement.child
            path.push(0)
          }else{
            
            
            //if (currentElement.id){
              //idPathDepths.pop()
              
            //}
          
            if (currentElement.next){
              path[path.length-1]++
              currentElement = currentElement.next
            }else{
              
              path.pop()
              
              
              
             
              currentElement = currentElement.parent
              
              nextParent = true 
            }
          }
          
          
        }
               


      }
      //console.log(jsCode)
      this.source = source
      return source
    }
    constructor(str,name){
      if (str == ''){
        return
      }
      this.name = name
      const tagPattern = /[^\s="']+="[^"]*"|[^\s="']+='[^']*'|>/g
      const tagStartPattern = /<[^>\s]+/g

      const unclosedTags = new Map()

      var testPattern = tagStartPattern
      var match = testPattern.exec(str)
      var elementTokenStart = 0
      var readStartTag = true
      var currentElement = this.rootElement
      var element
      var elements



      var attrValIndex

  
      //this.rootNode.root = this.rootNode
      while(match){
        if (readStartTag){
          if (match[0].charAt(1) == "/"){

            element = unclosedTags.get(match[0].slice(2)).pop()

           
           // text = 

           element.childCount = 0

           

           if (element.tag == 'script'){
            //console.log('da')
            GUI.parseScript(element,str.slice(elementTokenStart,testPattern.lastIndex-match[0].length))
           
            //console.log('ds')
           }else{
            
            element.text.push(str.slice(elementTokenStart,testPattern.lastIndex-match[0].length))
            if (element.next != undefined){
              //console.log(element.next)

            
              element.child = element.next
              element.child.back = undefined
              element.lastChild = currentElement
              currentElement = element.next
              element.next = undefined  
              //currentElement.back = undefined
              while (currentElement != undefined){
                element.childCount++
                currentElement.parent = element
                currentElement = currentElement.next
              }
           }

              //text
            
          

            
            currentElement = element
              //console.log(currentElement.child,currentElement)
              
              //element.child.back = undefined
              
            }
            
         
            
          }else{
            currentElement.next = new GUIElement(match[0].slice(1),this)
            currentElement.next.back = currentElement
            currentElement = currentElement.next

           
            //tag = {refElement:new GUIElement(match[0].slice(1),this),isEnd:false}

            elements = unclosedTags.get(currentElement.tag)
            if (elements){
              elements.push(currentElement)
            }else{
              unclosedTags.set(currentElement.tag,[currentElement])
            }
          
            
          }
          //this.rootNode.root = this.rootNode.root.next
          //tags.push(tag)
          elementTokenStart = testPattern.lastIndex
          testPattern = tagPattern
          testPattern.lastIndex = elementTokenStart
          readStartTag = false
        }else{
          if (match[0].charAt(0) == ">"){
            //this.source.push(tag+str.slice(this.elementTokenStart,testPattern.lastIndex-1))
            elementTokenStart = testPattern.lastIndex
            readStartTag = true
            testPattern = tagStartPattern
          }else{
            if (match[0].slice(0,2) == 'id'){
              currentElement.id = match[0].slice(4,match[0].length-1)
              this.refs.set(currentElement.id,currentElement)
            }else{
              attrValIndex = match[0].indexOf('=')
              currentElement.attrs.set(match[0].slice(0,attrValIndex),match[0].slice(attrValIndex+2,match[0].length-1))
              //currentElement.data.push(match[0])
            } 
           
          }
        }
        
        match = testPattern.exec(str)
      }


      this.rootElement.child = this.rootElement.next
      this.rootElement.next = undefined
      this.rootElement.child.back = undefined
      currentElement = this.rootElement.child
      this.rootElement.childCount = 0
      while(1){
        this.rootElement.childCount++
        currentElement.parent = this.rootElement
        if (currentElement.next == undefined){
          this.rootElement.lastChild = currentElement
          currentElement.next = undefined
          break;
        }else{
          currentElement = currentElement.next
        }
      }

    }
}







module.exports = {
  Msg,
  Handler,
  HandleInfo,
  Connection,
  WebFile,
  WebContentManager,
  HttpResponder,
  GUI
  //FileManageInfo

}
