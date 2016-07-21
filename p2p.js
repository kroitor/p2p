'use strict'; // ES6 flag

//-----------------------------------------------------------------------------

;(() => {

    Number.prototype.toHexString = function () { return this.toString (16) }

    // a common wrapper for unified behaviour across all browsers
    $global.RTCPeerConnection =  $global.RTCPeerConnection ||
                                 $global.webkitRTCPeerConnection

    $platform.isBigEndian = (() => 
        (new DataView (new Int16Array ([256]).buffer).getUint16 (0) === 256)) ()

    $platform.isLittleEndian = !$platform.isBigEndian

    if ($platform.isLittleEndian) {
        
        $global.htons = $global.ntohs = (x =>
            new DataView (new Uint16Array ([x]).buffer).getUint16 (0))
        $global.htonl = $global.ntohl = (x =>
            new DataView (new Uint32Array ([x]).buffer).getUint32 (0))

    } else {

        $global.htons =
        $global.ntohs =
        $global.htonl =
        $global.ntohl = (x => x)
    }

    $global.inet6_atoh = (ip => {
        return _.flatten (ip.split (':').map ((v, k, l) =>
            v.length ? 
                parseInt (v, 16) :
                _(9 - l.length).times (() => 0)))
                })

    $global.inet6_htoa = (ip =>
        ip.map (x => x.toString (16)).join (':').replace (/(:0)+/, ':'))

    $global.inet_atoh = (ip => 
        ip.split ('.').reduce ((prev, cur) => 
            ((prev << 8) | parseInt (cur, 10)) >>> 0))

    $global.inet_htoa = (ip =>
        [((ip >>> 24) & 0xff),
         ((ip >>> 16) & 0xff),
         ((ip >>>  8) & 0xff),
         ((ip >>>  0) & 0xff)].map (x => x.toString (10)).join ('.'))

    log.timestampEnabled = true

}) ()

//-----------------------------------------------------------------------------

var Address = $component ({

    $defaults: {
        version: 4,
    },

    init: function () {

    },

    ipToString: function () {
        return (this.version == 6) ? inet6_htoa (this.ip) : inet_htoa (this.ip)
    },

    toString: function () { return this.ipToString () + ':' + this.port },

    fromString: function (s) {
        var ip = s.split (':')
        this.port = parseInt (ip.pop ())
        this.version = (ip.length > 1) ? 6 : 4
        this.ip = (this.version == 6) ? 
            inet6_atoh (ip.join (':')) : 
            inet_atoh (ip.first)
        return this
    },

    toBase64: function () {

        var dataView
        if (this.version == 6) {
            dataView = new DataView (new ArrayBuffer (16 + 2))
            var i = 0
            for (; i < this.ip.length; i++)
                dataView.setUint16 (2 * i, this.ip[i])
            dataView.setUint16 (2 * i, this.port)
        } else {
            var dataView = new DataView (new ArrayBuffer (4 + 2))
            dataView.setUint32 (0, this.ip)
            dataView.setUint16 (4, this.port)
        }
        return btoa (String.fromCharCode (...
            new Uint8Array (dataView.buffer)))
    },

    fromBase64: function (s) {
        
        var decoded = atob (s)
        $assert (decoded.length > 0)
        var ui = new Uint8Array (decoded.length)
        for (var i = 0; i < decoded.length; i++)
            ui[i] = decoded.charCodeAt (i)
        var dataView = new DataView (ui.buffer)
        this.version = (decoded.length > 6) ? 6 : 4
        
        if (this.version == 6) {
            this.ip = []
            for (i = 0; i < (decoded.length - 2); i += 2)
                this.ip.push (dataView.getUint16 (i))   
            this.port = dataView.getUint16 (i)
        } else {
            this.ip = dataView.getUint32 (0)
            this.port = dataView.getUint16 (4)
        }

        return this
    },

    isLocal: function () {
        if (this.version == 6)
            return false;
        // 10.0.0.0 - 10.255.255.255
        // 172.16.0.0 - 172.31.255.255
        // 192.168.0.0 - 192.168.255.255
        return ((this.ip >= 0x0a000000 && this.ip <= 0x0affffff) ||
                (this.ip >= 0xac100000 && this.ip <= 0xac1fffff) ||
                (this.ip >= 0xc0a80000 && this.ip <= 0xc0a8ffff))
    },

    isNotLocal: function () { return !this.isLocal () },
})

//-----------------------------------------------------------------------------

$mixin (RTCSessionDescription, {

    iceUfrag: function () {
        return this.sdp.match (/^a=ice-ufrag:([a-zA-Z0-9+/=]+)/mi)[1]
    },
    
    icePwd: function () {
        return this.sdp.match (/^a=ice-pwd:([a-zA-Z0-9+/=]+)/mi)[1]
    },
    
    fingerprint: function () { 
        return this.sdp.match (/^a=fingerprint:\S+\s([a-fA-F0-9:]+)/mi)[1]
    },

    fingerprintToBase64: function () {
        return btoa (String.fromCharCode.apply (String,
            this.fingerprint ().split (':').map (x => parseInt (x, 16))))
    },

    fingerprintFromBase64: function (fingerprintBase64) {
         return atob (fingerprintBase64)
            .split ('')
            .map (c => {
                var d = c.charCodeAt (0)
                var e = c.charCodeAt (0).toString (16).toUpperCase ()
                if (d < 16) e = '0' + e
                return e })
            .join (':')
    },

    bestCandidateAddress: function () {
        return this.sdp.match (/^a=candidate:.+?$/gmi).map (x => {
            let [, priority, ip, port] = 
                x.match (/^a=candidate:(?:\S+\s){3}(\S+)\s(\S+)\s(\S+)/i)
            return {
                address: (new Address ()).fromString (ip + ':' + port),
                priority: parseInt (priority) }
        }).filter (x =>
            ((x.address.version == 4) && x.address.isNotLocal ()))
        .reduce ((prev, cur) => 
            prev.priority >= cur.priority ? prev : cur)
        .address
    },

    toBase64: function () {
        return [
            this.iceUfrag (),
            this.icePwd (),
            this.fingerprintToBase64 (),
            this.bestCandidateAddress ().toBase64 ()
        ].join ('-')
    },

    fromBase64: function (s) {

        let [ iceUfrag, icePwd, fingerprint, udp, answer ] = s.split ('-')

        var address = (new Address ()).fromBase64 (udp)
        
        var sdp = [
            'v=0',
            'o=- 5498186869896684180 2 IN IP4 127.0.0.1',
            's=-',
            't=0 0',
            'a=msid-semantic: WMS',
            'm=application 9 DTLS/SCTP 5000',
            'c=IN IP4 0.0.0.0',
            'a=mid:data',
            'a=sctpmap:5000 webrtc-datachannel 1024',
            'a=setup:' + (answer ? 'active' : 'actpass'),
            'a=ice-ufrag:' + iceUfrag,
            'a=ice-pwd:' + icePwd,
            'a=fingerprint:sha-256 ' + this.fingerprintFromBase64 (fingerprint),
            [
                'a=candidate:0',            // foundation 
                '1',                        // component
                'udp',                      // transport
                '1',                        // priority
                 address.ipToString (),     // ip
                 address.port,              // port
                 'typ host',                // type
            ].join (' '), ]

        return {
            udp:        udp,
            address:    address,
            answer:     answer,
            type:       answer ? 'answer' : 'offer',
            sdp:        sdp.join ('\r\n') + '\r\n', }
    }, 

})

//-----------------------------------------------------------------------------

var Peer = $component ({

    $defaults: {

        connection: undefined,      // RTCPeerConnection
        channel: undefined,         // RTCDataChannel

        config: {                   // RTCPeerConnection config
            iceServers: [{
                urls: [ 'stun:stun.l.google.com:19302', ],
            }],
        },
        
        options: {                  // RTCDataChannel options
            ordered: false,
        },

        channelName: 'data',
    },

    onicecandidate: function (event) {
        log ((new Date ()).toISOString (),
            event.candidate ? event.candidate.candidate : event.candidate)
        if (!event.candidate && this.onopen) {
            var description = this.connection.localDescription
            var base64 = [ description.toBase64 () ]
            if (description.type == 'answer')
                base64.push (this.remoteAddress().toBase64 ())                
            this.onopen (this, description, base64.join ('-'))
        }
    },

    onnegotiationneeded: function () {
        log ((new Date ()).toISOString ())
        if (this.offer) {
            this.connection.setRemoteDescription (this.offer)
            this.createAnswer ()
        } else 
            this.createOffer ()
    },

    createAnswer: function () {
        log ((new Date ()).toISOString ())
        this.connection.createAnswer ().then (answer => {
            this.connection.setLocalDescription (answer)
        }).catch (reason => {
            throw new Error (reason)
        })
    },

    createOffer: function () {
        log ((new Date ()).toISOString ())
        this.connection.createOffer ().then (offer => {
            this.connection.setLocalDescription (offer)
        }).catch (reason => {
            throw new Error (reason)
        })
    },

    answer: function (description) {
        this.connection.setRemoteDescription (description)
    },

    oncreate: function () {
        log ((new Date ()).toISOString ())
        if (this.channel.readyState === 'open') {
            if (this.onconnect)
                this.onconnect (this)
        }
    },

    onclose: function () {
        log ((new Date ()).toISOString ())
        if (this.ondisconnect)
            this.ondisconnect (this)
    },

    onmessage: function (event) {
        log ((new Date ()).toISOString (), event.data)
        if (this.ondata)
            this.ondata (this, event)
    },

    ondatachannel: function (event) {
        log ((new Date ()).toISOString ())
        this.channel = event.channel
        this.channel.onopen = this.oncreate
        this.channel.onclose = this.onclose
    },

    addressMatches: function (string) {
        return (string == this.localAddress ().toBase64 ())
    },
    
    localAddress: function () {
        return this.connection.localDescription.bestCandidateAddress ()
    },
    
    remoteAddress: function () {
        return this.connection.remoteDescription.bestCandidateAddress ()
    },
    
    send: function (message) {
        return this.channel.send (message) 
    },

    init: function () {
        var self = this
        this.connection = new RTCPeerConnection (this.config, null)
        this.connection.onicecandidate = this.onicecandidate
        this.connection.onnegotiationneeded = this.onnegotiationneeded
        this.connection.ondatachannel = this.ondatachannel
        this.channel = 
            this.connection.createDataChannel (this.channelName, this.options)
        this.channel.onmessage = this.onmessage
    },
})

//-----------------------------------------------------------------------------

var Network = $singleton (Component, {

    $defaults: {
        peers: [],
    },

    interface: () => ({
        onopen: (peer, description, base64) => {
            log.i ((new Date ()).toISOString (), 'SDP',  description.type,
                'in Base64', base64, '(' + base64.length, 'bytes)')
            App.printSystemMessage (
                '<a target="_blank" href="#' + base64 + '">#'
                    + base64 + '</a>')
        },
        ondata: (peer, event) => {
            var data = JSON.parse (event.data)
            var remoteAddress = peer.remoteAddress ().toString ()
            if (data.type == 'message') 
                App.printMessage (data.message, remoteAddress)
            else if (data.type == 'system')
                App.printSystemMessage (event.data, remoteAddress)
            else
                log (peer, event)
        },
        onconnect: peer => { 
            log.gg ((new Date ()).toISOString (), 
                'Connected as', peer.localAddress ().toString (), 
                'to', peer.remoteAddress ().toString ())
            App.printSystemMessage (
                'Connected as ' + peer.localAddress ().toString () + 
                ' to ' + peer.remoteAddress ().toString ())
        },
        ondisconnect: peer => {
            log.ee ((new Date ()).toISOString (), 
                'Disconnected from', peer.remoteAddress ().toString ())
            App.printSystemMessage (
                'Disconnected from ' + peer.remoteAddress ().toString ())
        },
    }),

    offer: function () {
        this.peers.push (new Peer (this.interface ()))
    },

    startHandshake: function (description, base64) {

        log.i ((new Date ()).toISOString (), 
            'SDP Offer in Base64', base64, base64.length)
        
        this.peers.push (new Peer (_.extend ({
            offer: description,
        }, this.interface ())))
    },

    finishHandshake: function (description, base64) {

        log.i ((new Date ()).toISOString (),
            'SDP Answer in Base64', base64, base64.length)

        this.peers
            .filter (peer => peer.addressMatches (description.answer))
            .first
            .answer (description)        
    },

    answer: function (base64) {
        var description = (new RTCSessionDescription ()).fromBase64 (base64)
        if (description.answer)
            this.finishHandshake (description, base64)
        else
            this.startHandshake (description, base64)
    },
})

//-----------------------------------------------------------------------------

var App = $singleton (Component, {

    init: function () {
        document.ready (this.start) },

    onkeypress: function (event) {
        event = event || window.event
        var keyCode = event.keyCode || event.which
        if (!event.shiftKey && keyCode == '13') {
            if (this.input.value.length)
                this.send (this.input.value)
            this.input.value = ''
            return false
        }
    },

    start: function () {
        log.i ('Application started')
        this.output = N.one ('output')
        this.input = N.one ('.input')
        this.input.onkeypress = this.onkeypress 
        this.input.focus ()
        if (window.location.hash)
            this.send ('/' + window.location.hash)
        else 
            this.send ('/offer')
    },

    format: function (message) {
        var html = [ N ('date').html (new Date ().toISOString ()), ' ' ]
        if (message.from) 
            html.push (N ('from').html (message.from + ': '))         
        html.push (N ('text').html (message.html))
        return html
    },

    print: function (message) {
        var node = N ('message').attr (message.attr)                         
                                .appendTo (this.output)
                                .add (this.format (message))
        this.output.scrollTop = this.output.scrollHeight    
        return node
    },

    printMessage: (message, from) => App.print ({ html: message, from: from }),
    
    printSystemMessage: (message, from) => 
        App.printMessage (message, from).attr ({ system: true }),

    printHelp: function () {
        this.print ({
            html: [
                'Usage:',
                '<em>/offer</em> - offer invitation',
                '<em>/.+#([a-zA-Z0-9+/=]+)</em> - acknowledge a peer',
                'Any other string starting with <em>/</em> prints help',
            ].join ('\n'),
            class: 'system message',
        }) 
    },

    sendMessage: (peer, type, message) => 
        peer.send (JSON.stringify ({ type: type, message: message })),

    sendUserMessage:   (peer, message) => 
        App.sendMessage (peer, 'message', message),

    sendSystemMessage: (peer, message) => 
        App.sendMessage (peer, 'system',  message),

    send: function (message) {
        
        var firstWord = message.split (' ')[0]
        
        if (firstWord.length && firstWord[0] == '/') {
            
            this.printSystemMessage (message)

            if (/#([a-zA-Z0-9+/=-]+)/.test (message)) {
                
                let [, base64] = message.match (/#([a-zA-Z0-9+/=-]+)/)
                Network.answer (base64)

            } else if (firstWord == '/offer') 
                
                Network.offer ()
            
            else 
            
                this.printHelp ()

        } else {

            this.printMessage (message, 'you')
            Network.peers.each (peer => App.sendUserMessage (peer, message))
        }
    },
})

//-----------------------------------------------------------------------------