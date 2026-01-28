function getCookies(req){
    var cookies = req.headers['cookie'].split(';')
    for (var i= 0; i < cookies.length; i++){
        cookies[i] = cookies[i].split('=')
        if (cookies[i].length != 2){
            return []
        }
    }
    return cookies
}

module.exports = {
    getCookies
}