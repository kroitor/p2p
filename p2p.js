'use strict';

//-----------------------------------------------------------------------------

;(() => {

    Math.uniformRandom = function (max) { 
        return Math.floor (Math.random () * max)
    }
    
    $mixin (Number, {
        hex: $property (function () {
            var s = this.toString (16)
            return ((s.length % 2) ? '0' : '') + s
        })
    })
    
    $mixin (Uint8Array, { 
        hex: $property (function () {
            return this.reduce ((p, c) => { return (p.hex || p) + c.hex })
        })
    })
     
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
        ip.map (x => x.hex).join (':').replace (/(:0)+/, ':'))

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

    equals: function (address) {
        return ((this.version == address.version) &&
                (this.ip == address.ip) && 
                (this.port == address.port))
    },

    ipString: $property (function () {
        return (this.version == 6) ? inet6_htoa (this.ip) : inet_htoa (this.ip)
    }),

    string: $property (function () { return this.ipString + ':' + this.port }),

    fromString: $static (function (s) {

        var ip = s.split (':')
        var port = parseInt (ip.pop ())
        var version = (ip.length > 1) ? 6 : 4
        ip = (this.version == 6) ? 
            inet6_atoh (ip.join (':')) : 
            inet_atoh (ip.first)
        return new Address ({ version: version, ip: ip, port: port })
    }),

    base64: $property (function () {

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
    }),

    fromBase64: $static (function (s) {
        var decoded = atob (s)
        $assert (decoded.length > 0)
        var ui = new Uint8Array (decoded.length)
        for (var i = 0; i < decoded.length; i++)
            ui[i] = decoded.charCodeAt (i)
        var dataView = new DataView (ui.buffer)
        var ip, port
        var version = (decoded.length > 6) ? 6 : 4
        if (version == 6) {
            ip = []
            for (i = 0; i < (decoded.length - 2); i += 2)
                ip.push (dataView.getUint16 (i))   
            port = dataView.getUint16 (i)
        } else {
            ip = dataView.getUint32 (0)
            port = dataView.getUint16 (4)
        }
        return new Address ({
            ip: ip,
            port: port,
            version: version,
        })
    }),

    isLocal: $property (function () {
        if (this.version == 6)
            return false;
        return ((this.ip >= 0x0a000000 && this.ip <= 0x0affffff) || // 10.x.x.x
                (this.ip >= 0xac100000 && this.ip <= 0xac1fffff) || // 172.16-31.x.x
                (this.ip >= 0xc0a80000 && this.ip <= 0xc0a8ffff))   // 192.168.x.x
    }),

    isNotLocal: $property (function () { return !this.isLocal }),
})

//-----------------------------------------------------------------------------

$mixin (RTCSessionDescription, {

    iceUfrag: $property (function () {
        return this.sdp.match (/^a=ice-ufrag:([a-zA-Z0-9+/=]+)/mi)[1]
    }),
    
    icePwd: $property (function () {
        return this.sdp.match (/^a=ice-pwd:([a-zA-Z0-9+/=]+)/mi)[1]
    }),
    
    fingerprint: $property (function () { 
        return this.sdp.match (/^a=fingerprint:\S+\s([a-fA-F0-9:]+)/mi)[1]
    }),

    fingerprintBase64: $property (function () {
        return btoa (String.fromCharCode.apply (String,
            this.fingerprint.split (':').map (x => parseInt (x, 16))))
    }),

    fingerprintFromBase64: $static (function (base64) {
         return atob (base64)
            .split ('')
            .map (c => c.charCodeAt (0).hex.toUpperCase ())
            .join (':')
    }),

    bestCandidateAddress: $property (function () {
        return this.sdp.match (/^a=candidate:.+?$/gmi).map (x => {
            let [, priority, ip, port] = 
                x.match (/^a=candidate:(?:\S+\s){3}(\S+)\s(\S+)\s(\S+)/i)
            return {
                address: Address.fromString (ip + ':' + port),
                priority: parseInt (priority) }
        }).filter (x =>
            ((x.address.version == 4) && x.address.isNotLocal))
        .reduce ((prev, cur) => 
            prev.priority >= cur.priority ? prev : cur)
        .address
    }),

    base64: $property (function () {
        return [
            this.iceUfrag,
            this.icePwd,
            this.fingerprintBase64,
            this.bestCandidateAddress.base64,

        ].join ('-')
    }),

    fromBase64: $static (function (s) {

        let [ iceUfrag, icePwd, base64, udp, answer ] = s.split ('-')

        var address = Address.fromBase64 (udp)
        
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
            'a=fingerprint:sha-256 ' + this.fingerprintFromBase64 (base64),
            [
                'a=candidate:0',            // foundation 
                '1',                        // component
                'udp',                      // transport
                '1',                        // priority
                 address.ipString,          // ip
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
    }), 
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
        if (!event.candidate && this.onopen)
            this.onopen (this)
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

    localDescription: $property (function () {
        return this.connection.localDescription 
    }),

    remoteDescription: $property (function () {
        return this.connection.remoteDescription 
    }),

    localAddress: $property (function () {
        return this.localDescription.bestCandidateAddress
    }),
        
    remoteAddress: $property (function () {
        return this.remoteDescription.bestCandidateAddress
    }),
    
    send: function (message) {
        return this.channel.send (message)
    },

    sendJSON: function (object) {
        return this.send (JSON.stringify (object))  
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

var KBucket = $component ({

    $defaults: {
    },

    init: function () {

        this.contacts = []
    },

    update: function (id) {
        var index = this.contacts.indexOf (id);
        if (online) {
            if (index !== -1) {
                this.contacts.moveIndexToTail (index);
            } else {
                if (this.contacts.length < this.k) {
                    this.contacts.push (id);
                } else {
                    var that = this;
                    this.kademlia.PING (this.contacts[0], function (res) {
                        if (res && res.error) {
                            that.contacts.shift ();
                            that.contacts.push (id);
                        }
                    });
                }
                cb (id);
            }
        } else {
            if (index !== -1) {
                this.contacts.splice(index, 1);
            }
        }
    },

    length: $property (function () {

        this.contacts.length
    }),
})

//-----------------------------------------------------------------------------

var RoutingTable = $component ({

})

//-----------------------------------------------------------------------------

var NodeID = $singleton (Component, {

    random: function (length) {
        return new Uint8Array (length || 20).map (x => Math.uniformRandom (256))
    },

    sha1: function (length) {
        return Sha1.hash (this.random (length || 20).hex)
    }
})

//-----------------------------------------------------------------------------

var Network = $component ({

    $defaults: {
        peers: [],
    },

    interface: $property (function () {
        return _.pick (this, 'onopen', 'ondata', 'onconnect', 'ondisconnect')
    }),

    onopen: function (peer) {
        var description = peer.localDescription
        var base64 = [ description.base64 ]
        if (description.type == 'answer')
            base64.push (peer.remoteAddress.base64)
        base64 = base64.join ('-')
        log.i ('Base64', description.type, base64, '(' + base64.length, 'bytes)')
        App.submit ('/#' + base64)
    },

    ondata: function (peer, event) {
        try {
            var request = JSON.parse (event.data)
            if (request.message)
                App.print ({
                    html: request.message,
                    from: peer.remoteAddress.string 
                })
            else if (request.id)
                App.print ('Request:\n' + _.stringify (request))
            else
                throw new Error ('Unrecognized JSON request')
        } catch (error) {
            log.ee (peer.remoteAddress.string, event.data, error)
        }
    },

    onconnect: function (peer) {
        log.gg ('Connected as', peer.localAddress.string,
                'to', peer.remoteAddress.string)
        App.print ([ 'Connected as', peer.localAddress.string,
                     'to', peer.remoteAddress.string ])
        if (peer.localDescription.type == 'offer') {

            setTimeout (function () {

                var id = NodeID.sha1 ()

                for (var i = 0; i <= 0xfffff; i++) {
                    var hash = Sha1.hash (id + i)
                    if (hash.substring (0, 4) == '0000') {
                        peer.sendJSON ({
                            id: id + i,
                            hash: hash,
                        })   
                        break;
                    }  
                }

                App.print ('Done.')
                
            }, 0)
            
        }
    },

    ondisconnect: function (peer) {
        log.ee ('Disconnected from', peer.remoteAddress.string)
        App.print ([ 'Disconnected from', peer.remoteAddress.string ])        
    },

    bind: function (base64) {

        var decoded = RTCSessionDescription.fromBase64 (base64)
        log.i ('Base64', decoded.type, base64, '(' + base64.length, 'bytes)')
        
        if (decoded.answer) {
            var address = Address.fromBase64 (decoded.answer)
            return (this.peers
                        .filter (peer => peer.localAddress.equals (address))
                        .first
                        .answer (decoded))
        }
        
        this.peers.push (new Peer (_.extend ({ offer: decoded }, this.interface)))
        return this.peers.top        
    },

    peer: function () {
        this.peers.push (new Peer (this.interface))
        return this.peers.top
    },

    broadcast: function (object) {
        return this.peers.each (peer => peer.sendJSON (object))
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
        this.net = new Network ()
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
    
    submit: function (input) {
        var firstWord = input.split (' ')[0]
        if (firstWord.length && firstWord[0] == '/') {
            this.print (input)
            if (/#([a-zA-Z0-9+/=-]+)/.test (input)) {
                let [, base64] = input.match (/#([a-zA-Z0-9+/=-]+)/)
                this.net.bind (base64)
            } else if (firstWord == '/offer')
                this.net.peer ()
            else      
                this.usage ()  
        } else {
            this.print ({ html: input, from: 'you' })
            this.net.broadcast ({ message: input })
        }
    },
})

//-----------------------------------------------------------------------------