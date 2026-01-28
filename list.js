class ListItem{
    list
    val
    next = null
    index = 0
    remove(){
        console.log(this)
        this.list.remove(this.index)
    }
    constructor(val,list){
        this.val = val
        this.list = list
    }
   
}


class List{
    items = []
    item = null
    endItem
    #setItem(val,index){
        if (this.item == null){
            this.item = new ListItem(val,this)
            this.endItem = this.item
            return this.endItem
        }
        this.endItem.next = new ListItem(val,this)
        this.endItem = this.endItem.next
        this.endItem.index = index
        return this.endItem
    }
    append(val,index = -1){
        var item
        if (index == -1){
            item = this.#setItem(val,this.items.length)
            this.items.push(item)
            return item
        }
        item = this.#setItem(val,index)
        this.items.splice(index,0,item)
        for (var i = index+1; i < this.items.length; i++){
            this.items[i].index = i
        }
        return item
    }


    clear(){
        this.item = null
        this.items = []
    }
    remove(index,count=1){
        for (var i = index; i < index+count; i++){
            this.items[i] = this.items[i].next
            this.endItem = this.items[i]
        };
        if (this.endItem == null){
            this.item = null
        }
        this.items.splice(index,count)
        for (var i = index; i < this.items.length; i++){
            this.items[i].index = i
        }
    }

}
module.exports = {
    ListItem,
    List
}