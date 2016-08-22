'use strict';

//-----------------------------------------------------------------------------

;(() => {

    // uniformly-scattered random integer in range [ 0; max ) 
    Math.randomUniform = function (max) { 
        return Math.floor (Math.random () * max)
    }

    // array conversion
    $mixin (Array, {
        string: $property (function () { return String.fromCharCode.apply (null, this) }),
    })

    // number conversion
    $mixin (Number, {
        $property: {
            hex: function ()  { return this.toString (16).padl ('00') },
            bin: function ()  { return this.toString ( 2).padl ('00000000') },
            bit: function (n) { return (this & (1 << n)) >>> n },    
        },       
    })

    // string conversion
    $mixin (String, {

        padl: function (padding) { // pad mod length
            var l = this.length % padding.length
            return l ? (padding.substring (0, padding.length - l) + this) : this
        },

        lcp: function (string) { // longest common prefix
            for (var s = '', i = 0; i < this.length; i++, s += this[i])
                if (this[i] !== string[i]) break
            return s
        },

        chop: function (size) {
            var chunks = []
            for (var i = 0; i < this.length / size; i++) 
                chunks.push (this.slice (i * size, i * size + size))
            return chunks
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

    // TypedArray / ArrayBuffer conversion 
    var typedArrayMixin = {

        $property: {
            hex: function () {
                return (this.length < 2) ? this[0].hex :
                    this.reduce ((p, c) => ((typeof p == 'string') ? p : p.hex) + c.hex)
            },
            bin: function () { // bitwise representation (string of '0's and '1's)
                return (this.length < 2) ? this[0].bin :
                    this.reduce ((p, c) => ((typeof p == 'string') ? p : p.bin) + c.bin)
            },
            string: function () {
                return String.fromCharCode.apply (null, this)
            },
            btoa: function () { return this.string.btoa },
        },
        
        bit: function (n) { // returns nth bit 
            var bitsPerElement = this.BYTES_PER_ELEMENT * 8
            return (this[Math.floor (n / bitsPerElement)]).bit (n % bitsPerElement)
        },
        
        xor: function (array) {
            $assert (this.length === array.length)
            return this.map ((x, i) => x ^ array[i])
        },

        chop: function (size) {
            var chunks = []
            for (var i = 0; i < this.length / size; i++) 
                chunks.push (this.slice (i * size, i * size + size))
            return chunks
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

    // Networking Utility ·····················································

    // adapter
    $global.RTCPeerConnection =  $global.RTCPeerConnection ||
                                 $global.webkitRTCPeerConnection

    // endianness
    $platform.isBigEndian = (() => 
        (new DataView (new Int16Array ([256]).buffer).getUint16 (0) === 256)) ()

    $platform.isLittleEndian = !$platform.isBigEndian

    // host to network/network to host short/long byte order conversion
    if ($platform.isLittleEndian) {
        $global.htons = $global.ntohs = (x =>
            new DataView (new Uint16Array ([x]).buffer).getUint16 (0))
        $global.htonl = $global.ntohl = (x =>
            new DataView (new Uint32Array ([x]).buffer).getUint32 (0))
    } else {
        $global.htons = $global.ntohs = $global.htonl = $global.ntohl = (x => x)
    }

    // inet_* functions for string to IP / IP to string conversion

    // IPv6

    $global.inet6_atoh = (ip => 
        (_.flatten (ip.split (':') .map ((v, k, l) => v.length ? 
            parseInt (v, 16) : _(9 - l.length).times (() => 0)))))

    $global.inet6_htoa = (ip =>
        ip.map (x => x.hex).join (':').replace (/(:0)+/, ':'))

    // IPv4

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

        bestAddress: function () {
//             var matches = this.sdp.match (/^a=candidate:.+?$/gmi)
//             if (matches.length < 2) {
//                 log.ee ('Less than 2 matches:', matches.first)
//             }
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
                this.bestAddress.base64,

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
                [ 'a=candidate:0 1 udp 1', address.ipString,
                    address.port, 'typ host', ].join (' '),
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

var Packet = $component ({

})

//-----------------------------------------------------------------------------

var Peer = $component ({

    $defaults: {

        id:         undefined,      // remote id
        offer:      undefined,      // SDP offer        
        mtu:        1024,             // Maximum Transmission Unit
        sent:       undefined,      // TX log
        received:   undefined,      // RX log
        name:       'data',         // RTCDataChannel name

        link:       undefined,      // RTCPeerConnection
        channel:    undefined,      // RTCDataChannel

        options: {                  // RTCDataChannel options
            ordered: false,
        },

        config: {                   // RTCPeerConnection config
            iceServers: [{
                urls: [
                    'stun:stun.ideasip.com',             // +
                    'stun:stun.schlund.de',              // +
//                     'stun:stun.voiparound.com',          // +
//                     'stun:stun.voipbuster.com',          // +
//                     'stun:stun4.l.google.com:19302',     // +                    
//                     'stun:stun.voipstunt.com',           // =
//                     'stun:stun.l.google.com:19302',      // -
//                     'stun:stun1.l.google.com:19302',     // -
//                     'stun:stun2.l.google.com:19302',     // -
//                     'stun:stun3.l.google.com:19302',     // -
//                     'stun:stun.ekiga.net',               // -
//                     'stun:stun.voxgratia.org',           // -
                ],
            }],
        },
    },

    onicecandidate: function (event) {
        
        if (event.candidate)
            log.i (event.candidate.candidate)
            
//         if (!event.candidate && this.onopen)
//             log.i (this.localDescription.sdp)
            
        if (!event.candidate && this.onopen)
            this.onopen (this)
    },

    onnegotiationneeded: function () {
        
        if (this.offer) {

            if (typeof this.offer == 'string')
                this.offer = RTCSessionDescription.fromBase64 (this.offer)

            this.link.setRemoteDescription (this.offer).then (() => {
                this.createAnswer ()
            })

        } else 

            this.createOffer ()
    },

    createAnswer: function () {
        this.link.createAnswer ().then (answer => {
//             log.g ('answer begin')
            this.link.setLocalDescription (answer).then (() => {
//                 log.g ('answer end')
            })
        }).catch (reason => {
            throw new Error (reason)
        })
    },

    createOffer: function () {
        this.link.createOffer ().then (offer => {
//             log.i ('offer begin')
            this.link.setLocalDescription (offer).then (() => {
//                 log.i ('offer end')
            })
        }).catch (reason => {
            throw new Error (reason)
        })
    },

    answer: function (description) {
        if (typeof description == 'string')
            description = RTCSessionDescription.fromBase64 (description)
        this.id = description.id
        this.link.setRemoteDescription (description)
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

    ondatachannel: function (event) {
        this.channel = event.channel
        this.channel.onopen  = this.oncreate
        this.channel.onclose = this.onclose
    },

    $property: {
        
        remote: function () { return '' + this.id + this.remoteAddress.string },
        local:  function () { 
            return (this.attachedTo ?  this.attachedTo.id : '') + 
                this.localAddress.string
        },

        localDescription:  function () { return this.link.localDescription }, 
        remoteDescription: function () { return this.link.remoteDescription },

        localAddress:  function () { return this.localDescription.bestAddress },
        remoteAddress: function () { return this.remoteDescription.bestAddress },
    },

    onpacket: function (received, event) {

        var payload = received.chunks.join ('').atob

        try { received.data = JSON.parse (payload) }
        catch (e) { received.data = payload }

        var sent = this.sent.findWhere ({ id: received.id })
        if (sent && sent.resolve) 
            sent.resolve ({ request: sent, response: received })
        else if (this.ondata)
            this.ondata (this, received, event)
    },

    onchunk: function (data, event) {

        var received = this.received.findWhere ({ id: data.id })
        if (!received) {
            this.received.push ({ id: data.id, chunks: [] })
            received = this.received.top
        }

        if (received.data)
            return // this packet is processed already

        received.count = received.count || data.count
        received.chunks[data.i || 0] = data.chunk

        if (!received.count || (received.count > received.chunks.length))
            return // not all of the chunks are there yet

        this.onpacket (received, event)
    },

    onmessage: function (event) {
        
        try {
            var data = JSON.parse (event.data)
            if (!data.id && this.ondata)
                return this.ondata (this, data, event)
        } catch (e) {
            return this.ondata ? this.ondata (this, event.data, event) : undefined
        }

        this.onchunk (data, event)
    },
        
    send: function (data) {
        var data = (typeof data == 'string') ? data : JSON.stringify (data)
        return this.channel.send (data)
    },

    transmit: function (id, message) {

        return new Promise ((resolve, reject) => {

            var data = (typeof message == 'string') ? 
                message : JSON.stringify (message)

            var chunks = data.btoa.chop (this.mtu)

            // send first chunk
            this.send ({ id: id, count: chunks.length, chunk: chunks.first })

            // send each other chunk
            for (var i = 1; i < chunks.length; i++)
                this.send ({ id: id, i: i, chunk: chunks[i] })

            this.sent.push ({ id: id, resolve: resolve, chunks: chunks })
        })
    },

    request: function (message) {
        return this.transmit (Kademlia.random (), message)
    },

    reply: function (requestID, message) {
        return this.transmit (requestID, message)
    },

    relay: function (payload, to) { 
        return this.request ({ type: 'relay', payload: payload, to: to })
    },

    forward: function (payload, from) {
        return this.request ({ type: 'forward', payload: payload, from: from })
    },
    
    findNode: function (key) {
        return this.request ({ type: 'findNode', key: key })
    },

    message: function (message) { return this.request ({ message: message }) },
    ping:    function ()        { return this.request ({ type: 'ping' }) },
    pong:    function (id)      { return this.reply (id, { type: 'pong' }) },

    init: function () {        
        this.sent = this.sent || []
        this.received = this.received || []
        this.link = new RTCPeerConnection (this.config, null)
        this.link.onicecandidate = this.onicecandidate
        this.link.onnegotiationneeded = this.onnegotiationneeded
        this.link.ondatachannel = this.ondatachannel
        this.channel = this.link.createDataChannel (this.name, this.options)
        this.channel.onmessage = this.onmessage
        if (this.offer) {
            if (typeof this.offer == 'string')
                this.offer = RTCSessionDescription.fromBase64 (this.offer)
            this.id = this.offer.id
        }
    },
})

//-----------------------------------------------------------------------------

var KBucket = $component ({

    $defaults: {
        routingTable: undefined,
        k: undefined,
        contacts: undefined,
        prefix: '',
    },

    init: function () {
        this.contacts = this.contacts || []
        this.prefix = this.prefix || ''
    },

    $property: {

        space:  function ()   { return this.k - this.contacts.length },
        length: function ()   { return this.contacts.length },        
        
    },

    sortedByDistanceTo: function (id) {
        return Kademlia.sortByDistance (this.contacts, id)
    },

    update: function (id) {

        var i = this.contacts.indexOf (id)

        if (i !== -1)
            return this.contacts.push (this.contacts.splice (i, 1))

        if (this.space > 0)
            return this.contacts.push (id)

//         this.kademlia.PING (this.contacts[0], this.$ (function (res) {
//             if (res && res.error) {
//                 that.contacts.shift ()
//                 that.contacts.push (id)
//             }
//         })
    },

    refresh: function () {
//         return (this.kademlia
//              .node_lookup (this.contacts.random ())
//              .then (function (results) { }))
    },
})

//-----------------------------------------------------------------------------

var RoutingTable = $component ({

    $defaults: {
        a: 3,
        k: 20,
        B: 160,        
    },

    init: function () {
        this.buckets  = {
            '': new KBucket ({
                k: this.k,
                prefix: '',
                kademlia: this.kademlia,
                routingTable: this,
            }),
        }
    },

    bucketsByPrefix: function (id) {
        var bin = id.atob.bin
        return (Object
            .keys (this.buckets)
            .sort ((a, b) =>
                bin.lcp (b.atob.bin).length - bin.lcp (a.atob.bin).length)
            .map (key => this.buckets[key]))
    }, 

    findBucket: function (id) { return this.bucketsByPrefix (id).first },

    splitBucket: function (bucket) {

        var prefix = this.id.atob.bin.lcp (bucket.prefix)
        if (prefix.length === bucket.prefix.length) {
            if (Object.keys (this.buckets).length < constants.HASH_SPACE) {
                var nodes = bucket.contacts
                var prefix = bucket.prefix
                delete this.buckets[prefix]
                [ '0', '1' ].each (digit => { 
                    this.buckets[prefix + digit] = new KBucket ({
                        id: id,
                        k: this.k,
                        prefix: prefix + digit,
                        routingTable: this,
                    })
                })
                return this.insert (nodes)
            }
        }
        return false
    },

    sortedByDistanceTo: function (id) {
        return this.bucketsByPrefix (id).reduce ((a, b) => {
            if (a.length >= this.k) return a
            return [... a, ... b.sortedByDistanceTo (id)]
        }, [])
    },


    insert: function (id) {

        if (Array.isArray (id))
            return id.each (i => this.insert (i))

        if (id === this.id)
            return
            
        var bucket = this.findBucket (id)        
        if (bucket.contacts.length === this.k) {
            var ownBucket = this.findBucket (this.id)
            if (bucket === ownBucket || ownBucket.length === 1) {
                var couldSplit = true    
                while (bucket.length === this.k && couldSplit) {
                    couldSplit = this.splitBucket (bucket)
                    bucket = this.findBucket (id)
                }
            }
        }

        return bucket.update (id)
    },
})

//-----------------------------------------------------------------------------

var Kademlia = $singleton (Component, {

    $property: {
        a: 3,
        k: 20,
        B: 160,
    },

    random: function (length) {
        return (new Uint8Array (length || 20)
            .map (x => Math.randomUniform (256)).btoa)
    },

    sortByDistance: function (array, id) {
        return array.sort ((a, b) => 
            (Kademlia.distance (a, id) - Kademlia.distance (b, id)))
    },

    distance: function (a, b) { return a.atob.uint8.xor (b.atob.uint8).bin },

    sha1: function (length) { return this.random (length).hex.sha1 },
})

//-----------------------------------------------------------------------------

class UnreachableError extends Error {
    constructor () { super ('unreachable') }
}   

//-----------------------------------------------------------------------------
// WebRTC Connection Schema
//-----------------------------------------------------------------------------
//        A         ·         B         ·         C         ·         D        
//- - - - - - - - - · - - - - - - - - - · - - - - - - - - - · - - - - - - - - -
//                  ·                   ·                   ·
//        <······ offer ·······   B     ·                   ·
//        :         ·                   ·                   ·
//    A   ······· answer ·····>         ·                   ·
//                  ·         :         ·                   ·
//· · · · <-- AB connection --> · · · · · · · · · · · · · · · · · · · · · · · · 
//        |         ·                   ·                   ·
//        +-- lookupRequest -->         ·                   ·
//                  ·         |         ·                   ·
//        <-- lookupResponse -+         ·                   ·
//        |         ·                   ·                   ·
//    A   +---- relayOffer --->         ·                   ·
//                  ·         |         ·                   ·
//                  ·         +--- forwardOffer -->         ·
//                  ·                   ·         |         ·
//                  ·         <--- relayAnswer ---+   C     ·
//                  ·         |         ·                   ·
//        <-- forwardAnswer --+         ·                   ·
//        |         ·                   ·                   ·
//· · · · <------------ AC connection ------------> · · · · · · · · · · · · · ·
//                  ·                   ·                   ·
//    A   -------------- relayOffer -------------->         ·
//                  ·                   ·         |         ·
//                  ·                   ·         +--- forwardOffer -->
//                  ·                   ·                   ·         |
//                  ·                   ·         <--- relayAnswer ---+   D
//                  ·                   ·         |         ·
//        <------------ forwardAnswer ------------+         ·
//        |         ·                   ·                   ·
//· · · · <---------------------- AD connection ----------------------> · · · ·
//                  ·                   ·                   ·
//-----------------------------------------------------------------------------

var Node = $component ({

    $defaults: {

        routingTable: undefined,
        peers: {},

        id: undefined,
        B:  Kademlia.B,
        k:  Kademlia.k,
        a:  Kademlia.a,
        
    },

    init: function () {
        this.id = this.id || Kademlia.random ()
        this.routingTable = new RoutingTable ({ k: this.k })
    },

    interface: $property (function () {
        return _.pick (this, 'onopen', 'ondata', 'onconnect', 'ondisconnect')
    }),

    localSDP: function (peer) {
        var config = peer.localDescription
        var base64 = [ this.id, config.base64 ]
        if (config.type == 'answer')
            base64.push (peer.remoteAddress.base64)
        return base64.join (':')
    },

    onopen: function (peer) { App.submit ('/#' + this.localSDP (peer)) },
    onping: function (peer, packet, event) { peer.pong (packet.id) },
    
    onfindnode: function (peer, packet, event) {
        peer.reply (packet.id, {
            type:       packet.data.type,
            contacts:   this.routingTable
                            .sortedByDistanceTo (packet.data.key)
                            .without (peer.id),
        })
    },

    onrelay: function (peer, packet, event) {

        if (!this.peers[packet.data.to]) {
            peer.reply (packet.id, {
                type: packet.data.type,
                error: 'unreachable',
            })
        }
        
        this.peers[packet.data.to]
            .forward (packet.data.payload, peer.id)
            .timeout (30000)
            .then (result => {
                peer.reply (packet.id, {
                    type: packet.data.type,
                    payload: result.response.data.payload,                  
                })
            })

//         log.ii (peer.local, '<', peer.remote,
//             packet.id, packet.data.type,
//             packet.data.payload, '>', packet.data.to)
    },

    onforward: function (peer, packet, event) {

        this.peer ({
            offer: packet.data.payload.offer,
            onconnect: this.merge.then (this.onconnect),
            onopen: p => {
                var answer = { answer: this.localSDP (p) }
                peer.reply (packet.id, {
                    type: packet.data.type,
                    payload: answer,
                })
            },
        })

//         log.ii (peer.local, '<', peer.remote,
//             packet.id, packet.data.type,
//             packet.data.payload, '<', packet.data.from)
    },

    ondata: function (peer, packet, event) {
        var data = packet.data
        if (data.message) {
            App.print ({
               html: data.message,
//                 from: [peer.local, '<', peer.remote].join (' '),
                from: peer.local + ' < ' + peer.remote,
            })
//             log.gg (peer.local + ' < ' + peer.remote)
        }
        else if (data.type == 'ping' && this.onping)
            this.onping (peer, packet, event)
        else if (data.type == 'findNode' && this.onfindnode)
            this.onfindnode (peer, packet, event)
        else if (data.type == 'relay' && this.onrelay)
            this.onrelay (peer, packet, event)
        else if (data.type == 'forward' && this.onforward)
            this.onforward (peer, packet, event)
        else if (data.id)
            App.print ({ html: '\n' + _.stringify (data), from: peer.remote, })
    },

    merge: function (peer) {

        if (!this.peers[peer.id])
            return peer

//         log.i (peer.local, 'duplicated', this.peers[peer.id].remote)

        var old = this.peers[peer.id]

        var ufrags = {}
        ufrags[peer.localDescription.iceUfrag] = 
            ufrags[peer.remoteDescription.iceUfrag] = peer
        ufrags[old.localDescription.iceUfrag] =
            ufrags[old.remoteDescription.iceUfrag] = old

        var keys = Object.keys (ufrags).sort ()
        var key = keys.first

        var winner = (old == ufrags[key]) ? old : peer
        var loser = (peer == ufrags[key]) ? old : peer

//         loser.detach ()
        loser.link.close ()
        return winner
    },

    onconnect: function (peer) {

        this.peers[peer.id] = peer
        this.routingTable.insert (peer.id)

        log (peer.local, 'connected to', peer.remote)
//         App.print ([ peer.local, 'connected to', peer.remote ])

        return peer
    },

    join: function (peer) {

        if (!peer.offer) return

        Object.keys (App.net.nodes)
              .reject (id => [ this.id, App.node.id ].contains (id))
              .map (id => {
                    __.delay (100).then (() => { 
                        this.resolvePeer (id, [ App.node.id ])
                            .then (peer => { /* log.g (peer.id) */ }) 
                    })
                })
                    
//         var other = 
//             Object.keys (App.net.nodes)
//                   .reject (id => [ this.id, App.node.id ].contains (id))
//                   .first

//         if (other)
//             this.resolvePeer (other, [ App.node.id ])
//                 .then (peer => { log.g (peer.id) })

        this.iterativeFindNode (this.id)

//         peer.message ('hello').timeout (3000).then (log.g).catch (log.e)

        return peer
    },

    ondisconnect: function (peer) {    
        log (peer.local, 'disconnected from', peer.remote)
        App.print ([ peer.local, 'disconnected from', peer.remote ])

        peer.detach ()
    },

    find: function (address) {
        return this.attached.filter (peer =>
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
        
        var settings = { 
            onconnect:
                this.merge
                    .then (this.onconnect)
                    .then (this.join)
        }

        return this.attach (new Peer (_.extended (this.interface, settings, config)))
    },

    broadcast: function (message) {
        return this.attached.map (peer => peer.message (message))
    },

    ping: function (peer, n) {
        var i = 0
        var interval = setInterval (this.$ (function () {
            if (i++ < (n || 1)) {
//                 log (peer.local, '>', peer.remote, 'ping')
                var t = performance.now ()
                peer.ping ()
                    .timeout (30000)
                    .then (success => {
                        var elapsed = (performance.now () - t).toFixed (3)
                        log (peer.local, '<', peer.remote, success.request.id, success.response.data.type, elapsed)
                    })
            } else clearInterval (interval)
        }), 1500)
    },

    resolvePeer: function (id, peers) {

        return new Promise ((resolve, reject) => {

            if (this.peers[id])
                return resolve (this.peers[id])

            if (!(peers && peers.length))
                return reject (new UnreachableError ())

            this.peer ({
                onconnect: this.merge
                               .then (this.onconnect)
                               .then (resolve),
                onopen: peer => {
                    var offer = { offer: this.localSDP (peer) }
                    Promise.race (
                        peers.filter (id => this.peers[id])
                             .map (peer => 
                                this.peers[peer]
                                    .relay (offer, id)
                                    .timeout (30000)
                                    .then (success => {
                                        if (!success.response.data.payload.answer)
                                            throw success
                                        return success
                                    })
                                    .catch (failure => { log.e (failure) }))
                     ).timeout (30000)
                      .then (success => {
                            if (success)
                                peer.answer (success.response.data.payload.answer)
                      }).catch (reject)
                },
            })
        }) // TODO error handling .catch (failure => { throw failure })
    },

    resolveFindNode: function (id, peers, key) {

        return new Promise ((resolve, reject) => {

            this.resolvePeer (id, peers)
                .timeout (30000)
                .then (peer => {
                    return peer.findNode (key)
                        .timeout (30000)
                        .then (resolve)
                }).catch (reject)
        })
    },

    iterativeFindNode: function (key) {

        var shortlist = this.routingTable.sortedByDistanceTo (key)
        var closest = shortlist.first
        var contacted = []
        var peers = {}

        var howMany = _.min ([Kademlia.a, shortlist.length])
        var ids = _(howMany).times (() => shortlist.shift ())
        ids.each (id => contacted.push (id))
    
        __.map (ids, id => 
            this.resolveFindNode (id, peers[id], key)
                .then (result => {
                    
                    // TODO check for errors

                    result.response.data.contacts
                        .without (... contacted)
                        .each (contact => {
                            peers[contact] = 
                                _.uniq ([... peers[contact] || [], id])
                            shortlist.push (contact)
                        })

                    return result

                }).reflect

        ).then (results => {

            // TODO check for errors

//             log.i (results.reduce ((a, b) => [
//                 ... a,
//                 ... (b instanceof Error) ? [ b ] :
//                     b.response.data.contacts.without (... contacted),
//             ], []))
        })
    },

})

//-----------------------------------------------------------------------------

var Net = $component ({

    $defaults: {

        nodes: {},

        k: 20,
        B: 160,
    },

    node: function (config) {
        var node = new Node (config)
        this.nodes[node.id] = node
        return node.attachTo (this)
    },

    bind: function (config) {

        if (typeof config == 'string')
            config = RTCSessionDescription.fromBase64 (config)

        if (config.answer)
            for (var i = 0; i < this.attached.length; i++)
                if (this.attached[i].bind (config))
                    return

        if (!config.answer)
            return this.node ().peer ({ offer: config })

        return undefined
    },
})

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
        this.node = this.net.node ({ id: '++++++++++++++++++++++++++++' })

        if (window.location.hash)
            this.submit ('/' + window.location.hash)
        else {

            // currently executing block

            var i = 0
            function fork () {
                log.ee ('Done:', App.net.attached.length, 'nodes')
                if (++i < 10) {
                    App.submit ('/offer')
                    setTimeout (fork, i * 900)
                }
            }

            fork ()

        }
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
        var element = 
            N ('message').appendTo (this.output).add (this.format (message))
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
            else if (firstWord == '/ping')
                this.node.attached.each (peer => this.node.ping (peer))
            else      
                this.usage ()  
        } else {
            this.print ({ html: input, from: 'you' })
            this.node
                .broadcast (input)
                .each (x => x.catch (e => { // weird... could've been __.map / Promise.all
                    if (_.isTypeOf (TimeoutError, e))
                        log.ii ('Timeout Test OK')
                }))
        }
    },
})