    class MsgType{
        size
        conv;
        read;
        constructor(size,conv,read){
            this.size = size;
            this.conv = conv
            this.read = read
        }
    }
    

    class Msg{
        static type = {
            uInt32:{
            size:()=>{
                return new Promise((resolve,reject)=>{
                    resolve(4)
                })
            },
            conv:(num)=>{
                var mem = new DataView(new ArrayBuffer(4))
                mem.setUint32(0,num)
                return new Blob([mem.buffer])
            },
            read:(blob)=>{
                return blob.arrayBuffer().then(buff=>{
                    return Number((new DataView(buff)).getUint32(0))+0 
                })
                
            }
        },
        uInt64:{
            size:()=>{
                return new Promise((resolve,reject)=>{
                    resolve(8)
                })
            },
            conv:(num)=>{
                var mem = new DataView(new ArrayBuffer(8))
                mem.setBigUint64(0,BigInt(num))
                return new Blob([mem.buffer])
            },
            read:(blob)=>{
                return blob.arrayBuffer().then(buff=>{
                    return Number((new DataView(buff)).getBigUint64(0))+0 
                })
            }
        },
        uInt16:{
            size:(buff)=>{
                return new Promise((resolve,reject)=>{
                    resolve(2)
                })
            },
            conv:(num)=>{
                var mem = new DataView(new ArrayBuffer(2))
                mem.setUint16(0,num)
                return new Blob([mem.buffer])
            },
            read:(blob)=>{

                return blob.arrayBuffer().then(buff=>{
                    return new Number((new DataView(buff)).getUint16(0))+0
                })
                
            }
        }}

        static types = [
            this.type.uInt64,
            this.type.uInt16,
            new MsgType(
                (blob)=>{
                    return this.type.uInt64.read(blob.slice(0,8)).then(len=>{
                        return len+8
                    })
                },
                (str)=>{
                    return new Blob([this.type.uInt64.conv(str.length),str])
                },
                (blob)=>{
                    return blob.slice(8).text().then(str=>{
                        return str
                    })
                }),
            new MsgType(
                (blob)=>{
                    return this.type.uInt64.read(blob.slice(0,8)).then(size=>{
                        return size+8
                    })
                },
                (data)=>{
                    return new Blob([this.type.uInt64.conv(data.size),data])
                },
                (blob)=>{
                    //(blob)
                    return new Promise((resolve,reject)=>{
                        resolve(blob.slice(8))
                    })
                }
            ),
            new MsgType((blob)=>{
                return new Promise((resolve,reject)=>{
                    resolve(9)
                })
            },undefined,(blob)=>{
                return Msg.type.uInt64.read(blob.slice(0,8)).then(id=>{
                    return blob.slice(8).arrayBuffer().then(decodeMsg=>{
                        var receivedHandler = new Handler(id,undefined,(new Uint8Array(decodeMsg))[0])
                        //receivedHandler.remoteSet = 1
                        return receivedHandler
                    })
                })
            }),
            new MsgType((buff)=>{return new Promise((resolve,reject)=>{
                    resolve(0)
                })
            },undefined,(buff)=>{
                return new Promise((resolve,reject)=>{
                    resolve(undefined)
                })
            }),
            new MsgType((buff)=>{
                return new Promise((resolve,reject)=>{
                    resolve(1)
                })
            },(num)=>{
                return String.fromCharCode(num)
            },(buff)=>{
                return buff.arrayBuffer().then(num=>{
                    return (new Uint8Array(num))[0]
                })
            })   


        ]

        static getTypeId(val){
            if (typeof val === 'string'){
                return 2
                }else if (typeof val === 'number'){
                    if (val < 256 || val > -128){
                        return 6
                    }
                return -1
                }else if (val instanceof Blob){
                return 3
                }else if(val == undefined){
                    return 5
                }
        }

        static encode(vals){
            var body = []
            var typeId = 0
            for (var i = 0; i < vals.length; i++){
                typeId = Msg.getTypeId(vals[i])
                body.push(String.fromCharCode(typeId))
                if (this.types[typeId].conv){
                    body.push(this.types[typeId].conv(vals[i]))
                }
                
            }
            return new Blob(body)
        }
        static decode(blob){
            if (blob.size == 0){
                return new Promise((resolve,reject)=>{
                    resolve([])
                })
            }
            return this.#iterVals(blob,blob.size,0,[]).then(vals=>{
                console.log(vals)
                return Promise.all(vals)
            })
        }
        static #iterVals(blob,blobSize,i,vals){
            return blob.slice(i,i+1).arrayBuffer().then(type=>{
                i+=1
                type = (new Uint8Array(type))[0]
                return this.types[type].size(blob.slice(i)).then(size=>{
                    
                    vals.push(this.types[type].read(blob.slice(i,i+size)))
                    i+=size
                    if (i == blobSize){
                        return vals
                    }else{
                        return this.#iterVals(blob,blobSize,i,vals)
                    }
                })
                
            })
        }
        
    }

 



    class Handler{
        decodeMsg
        func;
        id;
        //remoteSet;
        constructor(id,func,decodeMsg=1){
            this.func = func
            this.decodeMsg = decodeMsg
            this.id = id
            
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
        connected = false
        handlers = new Map()
        socket
        handle(handler,args){
            this.socket.send(new Blob([String.fromCharCode(0),Msg.type.uInt64.conv(handler.id),Msg.encode(args)]))
        }
        setHandler(handler){
            //if (handler.remoteSet){
                this.handlers.set(handler.id,handler)
                this.socket.send(new Blob([String.fromCharCode(1),Msg.type.uInt64.conv(handler.id)]))
            //}
        }
        constructor(socket,handlers=[]){
            this.socket = socket
            for (var i = 0; i < handlers.length; i++){
                this.handlers.set(handlers[i].id,handlers[i])
            }
            socket.onmessage = e=>{
                e.data.slice(0,1).arrayBuffer().then(head=>{
                    Msg.type.uInt64.read(e.data.slice(1,9)).then(id=>{


                        if (head == 1){
                            this.handlers.delete(id)
                            return
                        }else{
                            var handler = this.handlers.get(id)
                        }

                        var data = e.data.slice(9)
                        if (handler.decodeMsg == 1){
                            Msg.decode(data).then(args=>{
                                handler.func(args,new HandleInfo(this,data))
                            })
                            return
                        }
                        handler.func(new HandleInfo(this,data))
    
                    })
                })
                
                
            }
        }
    }



    function getCookies(){
        var cookies = document.cookie.split(';')
        for (var i= 0; i < cookies.length; i++){
            cookies[i] = cookies[i].split('=')
        }
        return cookies
    }
    function delCookie(name, path = '/'){
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT; path="+path
    }

    function getElement(rootElement,path){
        console.log(path)
        for (var i = 0; i < path.length; i++){
            if (path[i] != -1){
                rootElement = rootElement.firstElementChild
                for (var i2 = 0; i2 < path[i]; i2++){
                    rootElement = rootElement.nextElementSibling
                }
            }
            
        }
        return rootElement
    }



    function swapChildren(elementA,elementB){
        var lastChild = elementA.lastChild

        parentChildren(elementB,elementA)
        if (lastChild){
            while(elementA.firstChild != lastChild){
                elementB.appendChild(elementA.firstChild)
            }
            elementB.appendChild(lastChild)
        }

        //console.log(num)
       
    }

    

    function cloneChildren(element,parent,deep=true){
        var currentNode = element.firstChild
        while(currentNode != undefined){
            parent.appendChild(currentNode.cloneNode(deep))
            currentNode = element.firstChild
        }
    }

    function parentChildren(element,parent){
        var currentNode = element.firstChild
        while(currentNode != undefined){
            parent.appendChild(currentNode)
            currentNode = element.firstChild
        }
    }

    
    function randomNum(min,max){
        return Math.random()*(max-min)+min
    }



