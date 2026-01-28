onViewElms = document.querySelectorAll('.onView')

const onView = new Map()
const observers = new Map()
var observer

for (i = 0; i < onViewElms.length; i++){
    observer = observers.get(onViewElms[i].dataset.viewthreshold)
    if (observer == undefined){
        observer = new IntersectionObserver((entry)=>{
            var onViewFunc = onView.get(entry[0].target.id)
            if (entry[0].isIntersecting){
                if (onViewFunc){
                    onViewFunc(1)
                }
                for (var i = 0; i < entry[0].target.children.length; i++){
                    //console.log(entry[0].target.children[i].dataset.onviewdisplay)
                    entry[0].target.children[i].classList.add(entry[0].target.children[i].dataset.onviewdisplay)
                }
                return
            }
            if (onViewFunc){
                onViewFunc(0)
            }
            for (var i = 0; i < entry[0].target.children.length; i++){
                entry[0].target.children[i].classList.remove(entry[0].target.children[i].dataset.onviewdisplay)
            }
            },{threshold: parseFloat(onViewElms[i].dataset.viewthreshold)})
        observers.set(onViewElms[i].dataset.viewthreshold)
    }
    observer.observe(onViewElms[i])
}

