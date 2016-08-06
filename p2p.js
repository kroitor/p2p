'use strict';

//-----------------------------------------------------------------------------

;(() => {

    Math.randomUniform = function (max) { 
        return Math.floor (Math.random () * max)
    }

    $mixin (Array, {
        moveBack: function (i) { this.push (this.splice (i, 1)); return this },
        string: $property (function () { return String.fromCharCode.apply (null, this) }),
    })
    
    $mixin (Number, {
        
        $property: {
            hex: function ()  { return this.toString (16).padl ('00') },
            bin: function ()  { return this.toString ( 2).padl ('00000000') },
            bit: function (n) { return (this & (1 << n)) >>> n },    
        },       
    })

    $mixin (String, {

        padl: function (padding) {
            var l = this.length % padding.length
            return l ? (padding.substring (0, padding.length - l) + this) : this
        },

        lcp: function (string) {
            for (var s = '', i = 0; i < this.length; i++, s += this[i])
                if (this[i] !== string[i]) break
            return s
        },
        
        $property: {

            btoa: function () { return btoa (this) },
            atob: function () { return atob (this) },
            sha1: function () { return Sha1.hash (this) },
            
            hex: function () {
                return this.split ('').map (x => x.charCodeAt (0).hex).join ('')
            },
            
            bin: function () {
                return this.split ('').map (x => x.charCodeAt (0).bin).join ('')
            },
            
            uint16: function () {
                var dataView = new Uint16Array (new ArrayBuffer (this.length * 2))
                for (var i = 0; i < this.length; i++)
                    dataView[i] = this.charCodeAt (i)
                return dataView
            },
            
            uint8: function () {
                var dataView = new Uint8Array (new ArrayBuffer (this.length * 2))
                for (var i = 0, j = 0; i < this.length; i++) {
                    var c = this.charCodeAt (i)
                    if (c > 255)
                        dataView[j++] = 0xff && (c >>> 8)
                    dataView[j++] = 0xff && (c >>> 0)
                }
                return dataView.slice (0, j)
            },
        },
    })

    var typedArrayMixin = {

        $property: {
            hex: function () {
                return (this.length < 2) ? this[0].hex :
                    this.reduce ((p, c) => ((typeof p == 'string') ? p : p.hex) + c.hex)
            },
            bin: function () {
                return (this.length < 2) ? this[0].bin :
                    this.reduce ((p, c) => ((typeof p == 'string') ? p : p.bin) + c.bin)
            },
            string: function () {
                return String.fromCharCode.apply (null, this)
            },
            btoa: function () { return this.string.btoa },
        },
        
        bit: function (n) {
            var bitsPerElement = this.BYTES_PER_ELEMENT * 8
            return (this[Math.floor (n / bitsPerElement)]).bit (n % bitsPerElement)
        },
        
        xor: function (array) {
            $assert (this.length === array.length)
            return this.map ((x, i) => x ^ array[i])
        },
    }
        
    $mixin (Uint8Array,  typedArrayMixin)
    $mixin (Uint16Array, typedArrayMixin)
    $mixin (Uint32Array, typedArrayMixin)

    $mixin (ArrayBuffer, {
        hex:    $property (function () { return new Uint8Array (this).hex }),
        bin:    $property (function () { return new Uint8Array (this).bin }),
        string: $property (function () { return new Uint8Array (this).string }),
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

    $property: {

        ipString: function () {
            return (this.version == 6) ?
                inet6_htoa (this.ip) : inet_htoa (this.ip)
        },

        string: function () { return this.ipString + ':' + this.port },
        base64: function () { return this.uint8.string.btoa },

        uint8: function () {
            var view
            if (this.version == 6) {
                view = new DataView (new ArrayBuffer (16 + 2))
                for (var i = 0; i < this.ip.length; i++)
                    view.setUint16 (2 * i, this.ip[i])
                view.setUint16 (2 * i, this.port)
            } else {
                view = new DataView (new ArrayBuffer (4 + 2))
                view.setUint32 (0, this.ip)
                view.setUint16 (4, this.port)
            }
            return new Uint8Array (view.buffer)
        },

        isLocal: function () {
            if (this.version == 6) return false
            return ((this.ip >= 0x0a000000 && this.ip <= 0x0affffff) || // 10.x.x.x
                    (this.ip >= 0xac100000 && this.ip <= 0xac1fffff) || // 172.16-31.x.x
                    (this.ip >= 0xc0a80000 && this.ip <= 0xc0a8ffff))   // 192.168.x.x
        },

        isNotLocal: function () { return !this.isLocal },
    },

    $static: {

        fromString: function (s) {

            var ip = s.split (':')
            var port = parseInt (ip.pop ())
            var version = (ip.length > 1) ? 6 : 4
            ip = (this.version == 6) ? 
                inet6_atoh (ip.join (':')) : inet_atoh (ip.first)
            return new Address ({ version: version, port: port, ip: ip })
        },

        fromBase64: function (s) {

            var view = new DataView (s.atob.uint8.buffer)
            var ip, port
            var version = (view.byteLength > 6) ? 6 : 4
            if (version == 6) {
                ip = []
                for (i = 0; i < (view.byteLength - 2); i += 2)
                    ip.push (view.getUint16 (i))   
                port = view.getUint16 (i)
            } else {
                ip = view.getUint32 (0)
                port = view.getUint16 (4)
            }
            return new Address ({ version: version, port: port, ip: ip, })
        },
    },

})

//-----------------------------------------------------------------------------

$mixin (RTCSessionDescription, {

    $property: {

        iceUfrag: function () {
            return this.sdp.match (/^a=ice-ufrag:([a-zA-Z0-9+/=]+)/mi)[1]
        },

        icePwd: function () {
            return this.sdp.match (/^a=ice-pwd:([a-zA-Z0-9+/=]+)/mi)[1]
        },

        fingerprint: function () { 
            return this.sdp.match (/^a=fingerprint:\S+\s([a-fA-F0-9:]+)/mi)[1]
        },

        fingerprintBase64: function () {
            return String.fromCharCode.apply (String,
                this.fingerprint
                    .split (':')
                    .map (x => parseInt (x, 16))).btoa
        },  

        bestCandidateAddress: function () {
            return this.sdp.match (/^a=candidate:.+?$/gmi).map (x => {
                let [, priority, ip, port] = 
                    x.match (/^a=candidate:(?:\S+\s){3}(\S+)\s(\S+)\s(\S+)/i)
                return {
                    address: Address.fromString (ip + ':' + port),
                    priority: parseInt (priority) }
            }).filter (x => ((x.address.version == 4) && x.address.isNotLocal))
            .reduce ((prev, cur) => prev.priority >= cur.priority ? prev : cur)
            .address
        },

        base64: function () {
            return [
                this.iceUfrag,
                this.icePwd,
                this.fingerprintBase64,
                this.bestCandidateAddress.base64,

            ].join (RTCSessionDescription.separator)
        },
    },

    $static: {

        separator: $property (':'),

        fingerprintFromBase64: function (base64) {
             return base64
                .atob
                .split ('')
                .map (c => c.charCodeAt (0).hex.toUpperCase ())
                .join (':')
        },

        fromBase64: function (s) {

            let [ id, iceUfrag, icePwd, base64, udp, answer ] = 
                s.split (RTCSessionDescription.separator)

            var localAddress = answer ? Address.fromBase64 (answer) : answer
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
                    'a=candidate:0',    // foundation 
                    '1',                // component
                    'udp',              // transport
                    '1',                // priority
                     address.ipString,  // ip
                     address.port,      // port
                     'typ host',        // type
                ].join (' '),
            ]

            return {
                id:            id,
                udp:           udp,
                address:       address,
                answer:        answer,
                localAddress:  localAddress,
                type:          answer ? 'answer' : 'offer',
                sdp:           sdp.join ('\r\n') + '\r\n',
                base64:        s,
            }
        }, 
    },
})

//-----------------------------------------------------------------------------

var Peer = $component ({

    $defaults: {

        id:         undefined,      // remote id
        offer:      undefined,      // SDP offer
        
        connection: undefined,      // RTCPeerConnection
        channel:    undefined,      // RTCDataChannel

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
        if (!event.candidate && this.onopen)
            this.onopen (this)
    },

    onnegotiationneeded: function () {
        if (this.offer) {
            this.connection.setRemoteDescription (this.offer)
            this.createAnswer ()
        } else 
            this.createOffer ()
    },

    createAnswer: function () {
        this.connection.createAnswer ().then (answer => {
            this.connection.setLocalDescription (answer)
        }).catch (reason => {
            throw new Error (reason)
        })
    },

    createOffer: function () {
        this.connection.createOffer ().then (offer => {
            this.connection.setLocalDescription (offer)
        }).catch (reason => {
            throw new Error (reason)
        })
    },

    answer: function (description) {
        this.id = description.id
        this.connection.setRemoteDescription (description)
        return this
    },

    oncreate: function () {
        if (this.channel.readyState === 'open') {
            if (this.onconnect)
                this.onconnect (this)
        }
    },

    onclose: function () {
        if (this.ondisconnect)
            this.ondisconnect (this)
    },

    onmessage: function (event) {
        if (this.ondata)
            try {
                this.ondata (this, JSON.parse (event.data), event)
            } catch (e) {
                this.ondata (this, event.data, event)
            }
    },

    ondatachannel: function (event) {
        this.channel = event.channel
        this.channel.onopen = this.oncreate
        this.channel.onclose = this.onclose
    },

    $property: {

        string: function () {
            return this.id + '@' + this.remoteAddress.string  
        },

        localDescription: function () {
            return this.connection.localDescription 
        },

        remoteDescription: function () {
            return this.connection.remoteDescription 
        },

        localAddress: function () {
            return this.localDescription.bestCandidateAddress
        },

        remoteAddress: function () {
            return this.remoteDescription.bestCandidateAddress
        },
    },
        
    send: function (message) {
        var message = (typeof message == 'string') ? 
            message : JSON.stringify (message)
        return this.channel.send (message)
    },

    init: function () {
        var self = this
        if (this.offer)
            this.id = this.offer.id
        this.connection = new RTCPeerConnection (this.config, null)
        this.connection.onicecandidate = this.onicecandidate
        this.connection.onnegotiationneeded = this.onnegotiationneeded
        this.connection.ondatachannel = this.ondatachannel
        this.channel = this.connection.createDataChannel (this.channelName, this.options)
        this.channel.onmessage = this.onmessage
    },
})

//-----------------------------------------------------------------------------

var Node = $component ({

    $defaults: {
        id:             undefined,
        routingTable:   undefined,
        log:            log,

        peers: [],
    },

    init: function () {
        this.id = this.id || NodeID.random ().btoa

    },

    interface: $property (function () {
        return _.pick (this, 'onopen', 'ondata', 'onconnect', 'ondisconnect')
    }),

    onopen: function (peer) {
        var config = peer.localDescription
        var base64 = [ this.id, config.base64 ]
        if (config.type == 'answer')
            base64.push (peer.remoteAddress.base64)
        base64 = base64.join (':')
        App.submit ('/#' + base64)
    },

    ondata: function (peer, data, event) {
        if (data.message)
            App.print ({ html: data.message, from: peer.string,  })
        else if (data.id)
            App.print ({ html: '\n' + _.stringify (data), from: peer.string, })
    },

    onconnect: function (peer) {

        log (this.id, '@', peer.localAddress.string, 'connected to',
            peer.id, '@', peer.remoteAddress.string)

        App.print ([ 'Connected',
            'as', this.id, '@', peer.localAddress.string,
            'to', peer.id, '@', peer.remoteAddress.string ])

        if (peer.localDescription.type == 'offer') {
            peer.send ({ type: 'message', message: 'hi' })
        }
    },

    ondisconnect: function (peer) {
        
        log (this.id, '@', peer.localAddress.string, 'disconnected from',
            peer.id, '@', peer.remoteAddress.string)

        App.print ([ 'Disconnected from', peer.remoteAddress.string ])        
    },

    find: function (address) {
        return this.peers.filter (peer =>
            peer.localAddress.equals (address)).first
    },

    answer: function (config) {
        var peer = this.find (config.localAddress)
        return peer ? peer.answer (config) : peer
    },

    bind: function (config) {

        if (typeof config == 'string')
            config = RTCSessionDescription.fromBase64 (config)

        if (config.answer)
            return this.answer (config)

        return this.peer ({ offer: config })
    },

    peer: function (config) {
        this.peers.push (new Peer (_.extend (config || {}, this.interface)))
        return this.peers.top
    },

    broadcast: function (message) {
        return this.peers.each (peer => peer.send (message))
    },
})

//-----------------------------------------------------------------------------

var Net = $component ({

    $defaults: {
        nodes: undefined,
    },

    init: function () {
        if (!this.nodes)
            this.nodes = []
    },

    node: function () {
        this.nodes.push (new Node ())
        return this.nodes.top
    },

    bind: function (config) {

        if (typeof config == 'string')
            config = RTCSessionDescription.fromBase64 (config)

        if (config.answer)
            for (var i = 0; i < this.nodes.length; i++)
                if (this.nodes[i].bind (config))
                    return

        if (!config.answer)
            return this.node ().peer ({ offer: config })

        return undefined
    },

})

//
// WebRTC Kademlia Connection Schema
//-----------------------------------------------------------------------------
//        A         ·         B         ·         C         ·         D        
//- - - - - - - - - · - - - - - - - - - · - - - - - - - - - · - - - - - - - - -
//                  ·                   ·                   ·
//        <······ offer ·······         ·                   ·
//        :         ·                   ·                   ·
//        ······· answer ·····>         ·                   ·
//                  ·         :         ·                   ·
//        <---- connection --->         ·                   ·
//        |         ·                   ·                   ·
//        +-- lookupRequest -->         ·                   ·
//                  ·         |         ·                   ·
//        <-- lookupResponse -+         ·                   ·
//        |         ·                   ·                   ·
//        +---- relayOffer --->         ·                   ·
//                  ·         |         ·                   ·
//                  ·         +--- forwardOffer -->         ·
//                  ·                   ·         |         ·
//                  ·         <--- relayAnswer ---+         ·
//                  ·         |         ·                   ·
//        <-- forwardAnswer --+         ·                   ·
//        |         ·                   ·                   ·
//        <------------- connection -------------->         ·
//                  ·                   ·                   ·
//- - - - - - - - - · - - - - - - - - - · - - - - - - - - - · - - - - - - - - -
//                  ·                   ·                   ·
//        ----- relayOffer --->         ·                   ·
//                  ·         |         ·                   ·
//                  ·         +------------- forwardOffer ------------>
//                  ·                   ·         |         ·         |
//                  ·         <------------- relayAnswer -------------+
//                  ·         |         ·                   ·
//        <-- forwardAnswer --+         ·                   ·
//        |         ·                   ·                   ·
//        <------------------------ connection ----------------------->
//                  ·                   ·                   ·
//-----------------------------------------------------------------------------

var App = $singleton (Component, {

    $defaults: {
        net:  undefined,
        node: undefined,
    },

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
        
        this.output = N.one ('output')
        this.input = N.one ('.input')
        this.input.onkeypress = this.onkeypress 
        this.input.focus ()
        this.usage ()
        
        this.net = new Net ()
        this.node = this.net.node ()

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
        var element = N ('message').appendTo (this.output)
                                .add (this.format (message))
        this.output.scrollTop = this.output.scrollHeight    
        return element
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
            if (/#([a-zA-Z0-9+/=:-]+)/.test (input))
                this.net.bind (input.match (/#([a-zA-Z0-9+/=:-]+)/)[1])
            else if (firstWord == '/offer')
                this.node.peer ()
            else      
                this.usage ()  
        } else {
            this.print ({ html: input, from: 'you' })
            this.node.broadcast ({ message: input })
        }
    },
})

//-----------------------------------------------------------------------------


String.prototype.map = function () {
    return Array.prototype.map.apply (this, arguments).join ('')
}

String.prototype.filter = function () {
    return Array.prototype.filter.apply (this, arguments).join ('')
}

String.prototype.xor = function (b) {
    return this.map (function (a, i) {
        return a != b[i] ? '1' : '0'
    })
}

String.prototype.greaterThan = function (b) {
    for (var i = 0, l = this.length; i < l; i++) {
        var thisChar = this.charAt (i)
        if (thisChar !== b.charAt (i)) {
            return this.charAt(i) === '1' ? true : false
        }
    }
    return false
}

String.prototype.lowerThan = function (b) {
    for (var i = 0, l = this.length; i < l; i++) {
        var thisChar = this.charAt (i)
        if (thisChar !== b.charAt (i)) {
            return this.charAt (i) === '0' ? true : false
        }
    }
    return false
}

var ALPHABET = [
    "A", "B", "C", "D", "E", "F", "G", "H",
    "I", "J", "K", "L", "M", "N", "O", "P",
    "Q", "R", "S", "T", "U", "V", "W", "X",
    "Y", "Z", "a", "b", "c", "d", "e", "f",
    "g", "h", "i", "j", "k", "l", "m", "n",
    "o", "p", "q", "r", "s", "t", "u", "v",
    "w", "x", "y", "z", "0", "1", "2", "3",
    "4", "5", "6", "7", "8", "9", "-", "_",
]

function binaryToB64 (n) {
    var b64String = ''
    while (n.length > 5) {
        // take last 6 bits, 2^6 = 64
        var last6Bits = n.substr (n.length - 6, 6)
        n = n.substr (0, n.length - 6)

        var decimalDigit = parseInt (last6Bits, 2)
        b64String = ALPHABET[decimalDigit] + b64String
    }
    if (n.length > 0) {
        var decimalDigit = parseInt (n, 2)
        b64String = ALPHABET[decimalDigit] + b64String
    }
    return b64String
}

function binaryToDecimal (n) {
    return parseInt (n, 2)
}

function b64ToDecimal (n) {
    return parseInt (b64ToBinary (n), 2)
}

function b64ToBinary (n) {

    function prefixWithZeroes (digitString) {
        if (digitString.length === 6) {
            return digitString
        } else if (digitString.length < 6) {
            var restZeroes = [
                '',
                '0',
                '00',
                '000',
                '0000',
                '00000'
            ]
            var rest = 6 - digitString.length
            return restZeroes[rest] + digitString
        }
    }

    if (typeof n !== 'string') {
        debugger
        throw new TypeError ('the input argument `n` is not a string.')
    }

    var result = n.map (function (digit) {
        return prefixWithZeroes (ALPHABET.indexOf (digit).toString (2))
    })

    // IMPORTANT!!!
    // If the ID Space is eg. 8, then 4 leading zeroes are generated!
    // If its 160, 2 leading zeroes are generated.

    var padding = 6 - (constants.HASH_SPACE % 6)

    return result.substring (padding, result.length)
}

function getMostSignificantBits (id, n) {
    var binary = b64ToBinary (id)
    return binary.slice (0, n)
}

function getRandomBinarySequence (n) {
    var bits = ''
    for (var i = 0; i < n; i++) {
        var rand = Math.random ()
        if (rand > 0.5) {
            bits += '1'
        } else {
            bits += '0'
        }
    }
    return bits
}

var distance = function (a, b) {

    var aBin = b64ToBinary (a)
    bBin = b64ToBinary (b)

    return aBin.xor (bBin)
}

/**
* Sort an array of `ids` by the distance to `id`
* @param  {Array} array
* @param  {String} id
* @param  {Boolean} desc (optional)
* @return {Array}
*/
var sortByDistance = function (array, id, descending) {
    descending = !!descending
    if (descending)
        return array.sort ((a, b) => (distance (b, id) - distance (a, id)))
    else
        return array.sort ((a, b) => (distance (a, id) - distance (b, id)))
}

var commonPrefix = function (idB64, binaryPrefix) {
    var idBin = b64ToBinary (idB64)
    return idBin.commonPrefix (binaryPrefix)
}

var getRandomID = function () {
    return binaryToB64 (getRandomBinarySequence (constants.HASH_SPACE))
}

/**
* Return if the binary string `a` is greater than `b`
* @param  {String} a
* @param  {String} b
*/
var greaterThan = function (a, b) {
    return a.greaterThan (b)
}

var lowerThan = function (a, b) {
    return a.lowerThan (b)
}

var mergeKNearest = function (key, a, b) {

    var k = constants.K
    // we need a clone, because we use .shift() and don't want to touch the original arrays
    a = sortByDistance (a, key).slice ()
    b = sortByDistance (b, key).slice ()
    var nearest = []

    for (var i = 0; i < k; i++) {
        if (a.length === 0 && b.length === 0) return nearest
        var dist1 = distance (key, a[0])
        var dist2 = distance (key, b[0])

        if (dist1 < dist2) {
            nearest.push (a.shift ())
        } else {
            nearest.push (b.shift ())
        }
    }

    return nearest
}

//-----------------------------------------------------------------------------

var KBucket = $component ({

    $defaults: {
        contacts:       undefined,
        k:              undefined,
        prefix:         undefined,
        routingTable:   undefined,
    },

    init: function () {
        this.contacts = []
        this.prefix = 0xffff; // FIXME
    },

    length: $property (function () { return this.contacts.length }),

    update: function (id) {
        
        var index = this.contacts.indexOf (id)

        if (online) {
            if (index !== -1)
                this.contacts.moveIndexToTail (index)
            else {
                if (this.contacts.length < this.k)
                    this.contacts.push (id)
                else {
                    var that = this;
                    this.kademlia.PING (this.contacts[0], function (res) {
                        if (res && res.error) {
                            that.contacts.shift ()
                            that.contacts.push (id)
                        }
                    })
                }
                cb (id)
            }
        } else if (index !== -1)
            this.contacts.splice (index, 1)
    },

    // return ids sorted by distance to input id
    getClosest: function (id) {
        return util.sortByDistance (this.contacts, id)
    },

    refresh: function () {
        var randomId = this.getRandomID ()
        this.kademlia
            .node_lookup (randomId)
            .then (function (results) { })
    },

    // FIXME
    getRandomID: function () {
        var randomIndex = (Math.random () * this.length) | 0
        return this.contacts[randomIndex]
    },    
})

//-----------------------------------------------------------------------------

var RoutingTable = $component ({

    init: function () {

        // Initialize with the first bucket on stage -1
        // this bucket starts to split when it's full

//         this.k        = constants.K;
//         this.myID     = myID;
//         this.storage  = storage;
//         this.kademlia = null;

        this.buckets  = {
            '-1': new KBucket ({
                k: this.k,
                prefix: '',
                kademlia: this.kademlia,
                routingTable: this,
            }),
        }
    },

    findBucket: function (id) {

        if (this.buckets.hasOwnProperty ('-1'))
            return this.buckets['-1']

        var bin = id.atob.bin
        var i = this.buckets
                    .keys
                    .sort ((a, b) =>
                        bin.lcp (b.atob.bin).length -
                            bin.lcp (a.atob.bin).length)
                    .first

        return this.buckets[i]
    },

    splitBucket: function (bucket) {

        $assert (false, 'splitting bucket')
        var prefix = util.commonPrefix (this.myID, bucket.prefix)
        // TODO: detect special case in blue ...
        if (prefix.length === bucket.prefix.length) {
            if (Object.keys (this.buckets).length < constants.HASH_SPACE) {

                var nodes = bucket.contacts
                var prefix = bucket.prefix

//                 var nodes = bucket.getNodes ()
//                 var prefix = bucket.getPrefix ()


                delete this.buckets[prefix.length > 0 ? prefix : '-1']

                this.buckets[prefix + '0'] = new KBucket (this.k, prefix + '0', this.kademlia, this)
                this.buckets[prefix + '1'] = new KBucket (this.k, prefix + '1', this.kademlia, this)

                this.insertNodes (nodes)

                return true
            }
        }
        return false
    },

    handleNewNode: function (node) {
        var storage = this.storage
        var nearKeys = storage.getSimiliarKeys (node, this.$ (function (keys) {
            keys = Array.isArray (keys) ? keys : []
            keys.filter (this.$ (function (key) {

                var nodesDistance = util.distance (node, key)
                // look, if there ARENT exactly K better nodes (better means nearer at the key)
                var betterNodes = this.getKNearest (constants.K, key).filter (function (id) {
                    return util.lowerThan (util.distance (id, key), nodesDistance)
                })

                // if there aren't k better nodes, `node` has the responsibility to save the content
                if (betterNodes.length < constants.K)
                    storage
                        .get (key)
                        .then (function (value) {
                            if (value)
                                this.kademlia
                                    .STORE (node, key, value)
                                    .then (function (success) {}, function (failure) {})
                        })
            }))
        }))
    },

    insertNode: function (id, online) {

        if (id === this.myID) // FIXME
            return

        var bucket = this.findBucket (id)

        if (bucket.length === this.k) {
            var ownBucket = this.findBucket (this.myID)
            if (bucket === ownBucket || ownBucket.length === 1) {
                var couldSplit = true
                while (bucket.length === this.k && couldSplit && online) {
                    couldSplit = this.splitBucket (bucket)
                    bucket = this.findBucket (id)
                }
            }
        }

        bucket.update (id, online, this.handleNewNode)
    },

    insertNodes: function (ids) {
        if (Array.isArray (ids)) {
            ids.forEach (this.$ (function (id) { this.insertNode (id, true) }))
            return true
        }
        return false
    },


    getKNearest: function (k, id) {

        var bestFittingBuckets =
            this.buckets
                .keys ()
                .sort (function (a, b) {
                    return util.commonPrefix (id, b) - util.commonPrefix (id, a)
                }).map (this.$ (function (key) { return this.buckets[key] }))

        if (bestFittingBuckets[0].getLength () === k)
            return bestFittingBuckets[0].getClosest (id)

        // if the best fitting bucket isnt full, look in other buckets
        var closest = bestFittingBuckets[0].getClosest (id)

        var numNeeded = k - closest.length

        var bucketIndex = 1

        while (numNeeded > 0 && bucketIndex < bestFittingBuckets.length) {
            var currentBucket = bestFittingBuckets[bucketIndex]
            var currentBucketsNodes = currentBucket.getClosest (id)

            closest = (currentBucket.length > numNeeded) ?
                closest.concat (currentBucketsNodes.slice (0, numNeeded)) :
                closest.concat (currentBucketsNodes)

            numNeeded = k - closest.length
            bucketIndex++
        }

        return closest
    },

    receivedRPCResponse: function (ids) {
        Object.keys (ids).forEach (this.$ (function (id) { 
            this.insertNode (id, ids[id])
        }))
    }
})

//-----------------------------------------------------------------------------

var NodeID = $singleton (Component, {

    random: function (length) {
        return new Uint8Array (length || 20).map (x => Math.randomUniform (256))
    },

    sha1: function (length) { return this.random (length).hex.sha1 },
})

//-----------------------------------------------------------------------------

var Kademlia = $component ({

    $defaults: {
        id:             undefined,
        routingTable:   undefined,    
    },

    init: function () {
        this.id = this.id ? this.id : NodeID.sha1 ()
        this.routingTable =
            this.routingTable ? this.routingTable : new RoutingTable ()
    },

    getBootstrapPeers: function () {
        return new Promise (this.$ (function (resolve, reject) {
            this.transport.bootstrap (function (peers) {
                peers = peers.filter (x => (x !== null))
                resolve (peers)
            }, this)
        }))
    },

    removeOwnId: function (ids) {
        if (ids && Array.isArray (ids) && ids.length > 0) {
            var index = ids.indexOf (this.myRandomId)
            var arrayClone = ids.slice ()
            return (index !== -1) ? arrayClone.splice (index, 1) : ids
        }
        return []
    },

    join: function () {

        return new Promise (this.$ (function (resolve, reject) {

            // insert the bootstrap node into the routingTable

            // this.routingTable.insertNodes (...)

            // lookup our own id

            this.nodeLookup (this.id)
                .then (function (success) { resolve (success) })
                .catch (function (failure) { reject (failure) })

        }))
    },

    nodeLookup: function (key) {
        return new Promise (this.$ (function (resolve, reject) {
            var peers = this.routingTable.getKNearest (key)
            function lookup (peer) {
                if (peer === 'peer') return reject ()
                this.transport
                    .send (peer)
                    .timeout (constants.LOOKUP_TIMEOUT) // eg. 100000 ms
                    .payload ({ rpc: RPCS.NODE_LOOKUP_REQ, key: key })
                    .then (this.$ (function (succes, rtt) {
                        this.handleRoutingTable (RPCS.NODE_LOOKUP_RES, peer, succes, null)
                        resolve (succes)
                    }), this.$ (function (error) {
                        this.handleRoutingTable (RPCS.NODE_LOOKUP_RES, peer, null, error)
                        if (peers.length > 0) {
                            var newPeer = peers.shift ()
                            lookup.call (this, newPeer, peers.length)
                        } else
                            reject (error)
                    }))
            }
            if (peers.length > 0)
                lookup.call (this, peers.shift ())
            else
                reject (new Error ('No peers.'))
        }))
    },
})

//-----------------------------------------------------------------------------

var RPC = $component ({

    $defaults: {
        myID: undefined,
        transport: undefined,
        routingTable: undefined,
    },

    init: function () {
        this.myID         = myID;
        this.transport    = transport;
        this.routingTable = routingTable;        
    },

    handleRoutingTable: function (rpc, peer, res, err) {

        res = res || null
        var ok = !err

        var response = {}
        response[peer] = ok

        this.routingTable.receivedRPCResponse (response)

        var nodes = res !== null && res.nodes ? res.nodes : null

        if (nodes !== null) {

            var ids = {}

            nodes.forEach (function (node) {
                if (node !== peer)
                    ids[node] = true
            })

            if (Object.keys (ids).length > 0)
                this.routingTable.receivedRPCResponse (ids)
        }
    },

    ping: function (peer) {
        return new Promise (this.$ (function (resolve, reject) {

            peer.sendJSON ({ ping: true })

            this.transport
                .send (peer)
                .payload ({ rpc: RPCS.PING_REQ })
                .then (this.$ (function (success, rtt) {
                    this.handleRoutingTable (RPCS.PING_RES, peer, success, null)
                    resolve (success)
                }), this.$ (function (error) {
                    this.handleRoutingTable (RPCS.PING_RES, peer, null, error)
                    reject (error)
                }))
        }))
    },

    findNode: function (peer, node) {
        return new Promise (this.$ (function (resolve, reject) {
            this.transport
                .send (peer)
                .payload ({ rpc: RPCS.FIND_NODE_REQ, node: node })
                .then (this.$ (function (success, rtt) {
                    this.handleRoutingTable (RPCS.FIND_NODE_RES, peer, success, null)
                    if (success && success.nodes && Array.isArray (success.nodes))
                        resolve (success)
                    else
                        reject (success)
                }), this.$ (function (error) {
                    this.handleRoutingTable (RPCS.FIND_NODE_RES, peer, null, error)
                    reject (error)
                }))
        }))
    },

    findValue: function (peer, key) {
        return new Promise (this.$ (function (resolve, reject) {
            this.transport
                .send (peer)
                .payload ({ rpc: RPCS.FIND_VALUE_REQ, key: key })
                .then (this.$ (function success (success, rtt) {
                    this.handleRoutingTable (RPCS.FIND_VALUE_RES, peer, success, null)
                    resolve (success)
                }), this.$ (function (error) {
                    this.handleRoutingTable (RPCS.FIND_VALUE_RES, peer, null, error)
                    reject (error)
                }))
        }))
    },

    store: function (peer, key, value) {
        return new Promise (this.$ (function (resolve, reject) {
            this.transport
                .send (peer)
                .payload ({ rpc: RPCS.STORE_REQ, key: key, value: value })
                .then (this.$ (function (success, rtt) {
                    this.handleRoutingTable (RPCS.STORE_RES, peer, success, null)
                    resolve (success)
                }), this.$ (function (error) {
                    this.handleRoutingTable (RPCS.STORE_RES, peer, null, error)
                    reject (error)
                }))
        }));
    },

    valueLookup: function (key) {
        return new Promise (this.$ (function (resolve, reject) {
            var peers = this.routingTable.getKNearest (key)
            function lookup (peer) {
                var startTime = Date.now ()
                this.transport
                    .send (peer)
                    .timeout (constants.LOOKUP_TIMEOUT) // eg. 100000 ms
                    .payload ({
                        rpc: RPCS.VALUE_LOOKUP_REQ,
                        key: key,
                        pre: [this.myId],
                    })
                    .then (this.$ (function (success, rtt) {
                        this.handleRoutingTable (RPCS.VALUE_LOOKUP_RES, peer, success, null)
                        resolve (success)
                    }), this.$ (function (error) {
                        this.handleRoutingTable (RPCS.VALUE_LOOKUP_RES, peer, null, error)
                        if (peers.length > 0) 
                            lookup.call (this, peers.shift ())
                        else
                            reject (error)
                    }))
            }
            console.log (peers.length)
            if (peers.length > 0)
                lookup.call (this, peers.shift ())
            else
                reject (new Error ('No peers.'))
        }))
    },
})

//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------
//-----------------------------------------------------------------------------