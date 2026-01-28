
class Random{
    static num(min,max){
        return Math.random()*(max-min)+min
    }
    static int(min,max){
        return Math.floor(Random.num(min,max))
    }
}

module.exports = {
    Random
}