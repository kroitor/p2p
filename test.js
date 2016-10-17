var i = 0
var interval

interval = setInterval (tick, 1000)

window.RTCPeerConnection = window.RTCPeerConnection ||
                           window.webkitRTCPeerConnection ||
                           window.mozRTCPeerConnection

function tick () { return (i++ < 200) ? pair () : clearInterval (interval) }

function pair () {

    var peer1 = new RTCPeerConnection ({
        iceServers: [{ urls: [ 'stun:stun.ideasip.com', 'stun:stun.schlund.de' ] }]
    })

    peer1.onicecandidate = function (event) {

        if (event.candidate) return; // do nothing, wait for more candidates
            
        var peer2 = new RTCPeerConnection ({
            iceServers: [{ urls: [ 'stun:stun.ideasip.com', 'stun:stun.schlund.de' ] }]
        })

        peer2.onicecandidate = function (event) {
            if (event.candidate) return; // do nothing, wait for more candidates
            peer1.setRemoteDescription (peer2.localDescription)
        }

        peer2.onnegotiationneeded = function () {
            peer2.setRemoteDescription (peer1.localDescription).then (function () {
                return peer2.createAnswer ().then (function (answer) {
                    return peer2.setLocalDescription (answer)
                })    
            })
        }

        var channel2 = peer2.createDataChannel ('data')
    }

    peer1.onnegotiationneeded = function () {
        return peer1.createOffer ().then (function (offer) {
            return peer1.setLocalDescription (offer)
        })
    }

    peer1.ondatachannel = function (event) {
        var channel = event.channel
        channel.onopen = function () { if (channel.readyState === 'open') { console.log (i + ' connected') }}
    }

    var channel1 = peer1.createDataChannel ('data')
}