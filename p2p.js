'use strict';

//-----------------------------------------------------------------------------

;(() => {

    Number.prototype.toHexString = function () { return this.toString (16) }

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
        return ((this.ip >= 0x0a000000 && this.ip <= 0x0affffff) || // 10.x.x.x
                (this.ip >= 0xac100000 && this.ip <= 0xac1fffff) || // 172.16-31.x.x
                (this.ip >= 0xc0a80000 && this.ip <= 0xc0a8ffff))   // 192.168.x.x
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
                return e
            }).join (':')
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
            ].join (' '),
        ]

        return {
            udp:        udp,
            address:    address,
            answer:     answer,
            type:       answer ? 'answer' : 'offer',
            sdp:        sdp.join ('\r\n') + '\r\n',
        }
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
        log (event.candidate ? event.candidate.candidate : event.candidate)
        if (!event.candidate && this.onopen) {
            var description = this.connection.localDescription
            var base64 = [ description.toBase64 () ]
            if (description.type == 'answer')
                base64.push (this.remoteAddress.toBase64 ())                
            this.onopen (this, description, base64.join ('-'))
        }
    },

    onnegotiationneeded: function () {
        log ()
        if (this.offer) {
            this.connection.setRemoteDescription (this.offer)
            this.createAnswer ()
        } else 
            this.createOffer ()
    },

    createAnswer: function () {
        log ()
        this.connection.createAnswer ().then (answer => {
            this.connection.setLocalDescription (answer)
        }).catch (reason => {
            throw new Error (reason)
        })
    },

    createOffer: function () {
        log ()
        this.connection.createOffer ().then (offer => {
            this.connection.setLocalDescription (offer)
        }).catch (reason => {
            throw new Error (reason)
        })
    },

    answer: function (description) {
        this.connection.setRemoteDescription (description)
        return this
    },

    oncreate: function () {
        log ()
        if (this.channel.readyState === 'open') {
            if (this.onconnect)
                this.onconnect (this)
        }
    },

    onclose: function () {
        log ()
        if (this.ondisconnect)
            this.ondisconnect (this)
    },

    onmessage: function (event) {
        log (event.data)
        if (this.ondata)
            this.ondata (this, event)
    },

    ondatachannel: function (event) {
        log ()
        this.channel = event.channel
        this.channel.onopen = this.oncreate
        this.channel.onclose = this.onclose
    },

    addressMatches: function (string) {
        return (string == this.localAddress.toBase64 ())
    },

    localAddress: $property (function () {
        return this.connection.localDescription.bestCandidateAddress ()
    }),
    
    localAddressString: $property (function () {
        return this.localAddress.toString ()
    }),
    
    remoteAddress: $property (function () {
        return this.connection.remoteDescription.bestCandidateAddress ()
    }),

    remoteAddressString: $property (function () {
        return this.remoteAddress.toString ()
    }),
    
    send: function (message) {
        return this.channel.send (message) 
    },

    init: function () {
        var self = this
        this.connection = new RTCPeerConnection (this.config, null)
        this.connection.onicecandidate = this.onicecandidate
        this.connection.onnegotiationneeded = this.onnegotiationneeded
        this.connection.ondatachannel = this.ondatachannel
        this.channel = this.connection.createDataChannel (this.channelName, this.options)
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
            log.i ('Base64', description.type,
                    base64, '(' + base64.length, 'bytes)')
            App.submit ('/#' + base64)
        },
        ondata: (peer, event) => {
            var data = JSON.parse (event.data)
            var from = peer.remoteAddressString
            switch (data.type) {
                case 'message': App.print ({ html: data.message, from: from }); break
                default: log (peer, event)
            }
        },
        onconnect: peer => { 
            log.gg ('Connected as', peer.localAddressString,
                    'to', peer.remoteAddressString)
            App.print ([
                'Connected as', peer.localAddressString,
                'to', peer.remoteAddressString
            ])
        },
        ondisconnect: peer => {
            log.ee ('Disconnected from', peer.remoteAddressString)
            App.print ([ 'Disconnected from', peer.remoteAddressString ])
        },
    }),

    handshake: function (base64) {

        if (!base64) {
            this.peers.push (new Peer (this.interface ()))
            return this.peers.top
        }

        var decoded = (new RTCSessionDescription ()).fromBase64 (base64)
        log.i ('Base64', decoded.type, base64, '(' + base64.length, 'bytes)')
        
        if (decoded.answer)
            return this.peers
                       .filter (peer => peer.addressMatches (decoded.answer))
                       .first
                       .answer (decoded)
        
        this.peers.push (new Peer (_.extend ({ offer: decoded }, this.interface ())))
        return this.peers.top
    },
})

//-----------------------------------------------------------------------------

var App = $singleton (Component, {

    init: function () {
        document.ready (this.start)
    },

    onkeypress: function (event) {
        event = event || window.event
        var keyCode = event.keyCode || event.which
        if (!event.shiftKey && keyCode == '13') {
            if (this.input.value.length)
                this.submit (this.input.value)
            this.input.value = ''
            return false
        }
    },

    start: function () {
        log.timestampEnabled = true
        log.i ('Application started')
        this.output = N.one ('output')
        this.input = N.one ('.input')
        this.input.onkeypress = this.onkeypress 
        this.input.focus ()
        this.usage ()
        if (window.location.hash)
            this.submit ('/' + window.location.hash)
        else 
            this.submit ('/offer')
    },

    format: function (message) {
        var html = [ N ('date').html (new Date ().toISOString ()), ' ' ]
        if (message.from) 
            html.push (N ('from').html (message.from + ': '))         
        html.push (N ('text').html (message.html))
        return html
    },

    print: function (message) {
        if (typeof message == 'string')
            message = { html: message }
        else if (Array.isArray (message))
            message = { html: message.join (' ') }
        var node = N ('message').appendTo (this.output)
                                .add (this.format (message))
        this.output.scrollTop = this.output.scrollHeight    
        return node
    },

    usage: function () {
        this.print ([
            'Usage:',
            '<em>/offer</em> - offer invitation',
            '<em>/ ... #([a-zA-Z0-9+/=]+)</em> - acknowledge a peer',
            'Any other string starting with <em>/</em> prints help',
        ].join ('\n'))
    },
    
    submit: function (message) {
        var firstWord = message.split (' ')[0]
        if (firstWord.length && firstWord[0] == '/') {
            this.print (message)
            if (/#([a-zA-Z0-9+/=-]+)/.test (message)) {
                let [, base64] = message.match (/#([a-zA-Z0-9+/=-]+)/)
                Network.handshake (base64)
            } else if (firstWord == '/offer')
                Network.handshake ()
            else      
                this.usage ()  
        } else {
            this.print ({ html: message, from: 'you' })
            Network.peers.each (peer => peer.send (JSON.stringify ({
                type: 'message',
                message: message,
            })))
        }
    },
})

//-----------------------------------------------------------------------------