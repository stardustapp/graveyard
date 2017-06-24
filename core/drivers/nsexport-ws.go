package drivers

import (
	"log"
	"net/http"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"

	"github.com/gorilla/websocket"
)

// API broker that serves many isolated stateful connections
// Intended for exposing Stardust APIs to clients
// The given nsexport is treated as a public jumpingoff-point
// Outputs from public functions can be stored in the private /tmp area
// On disconnection, all connection state is discarded

func NewWsBroker(ns *nsexport, path string) *nsexportWsBroker {
	public, ok := ns.root.Get("/")
	if !ok {
		return nil
	}

	broker := &nsexportWsBroker{
		svc: ns,
		public: public,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin:     func(r *http.Request) bool { return true },
		},
	}

	http.Handle(path, broker)
	log.Println("nsexport-ws: mounted at", path)
	return broker
}

// Context for a stateful client connection
type nsexportWsBroker struct {
	svc *nsexport
	public base.Entry
	upgrader websocket.Upgrader
}

func (b *nsexportWsBroker) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	conn, err := b.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	root := inmem.NewFolder("/")
	root.Put("tmp", inmem.NewFolder("tmp"))
	root.Put("pub", b.public)
	root.Freeze()
	ns := base.NewNamespace("nsexport-ws://", root)

	log.Println("nsexport-ws: accepted connection from", r.RemoteAddr)
	client := &nsexportWs{
		broker: b,
		root: base.NewRootContext(ns),
		conn: conn,

		remoteAddr: r.RemoteAddr,
	}
	go client.loop()
}


// Context for a stateful client connection
type nsexportWs struct {
	broker *nsexportWsBroker
	root base.Context
	conn *websocket.Conn

	remoteAddr string
}

func (e *nsexportWs) loop() {
	for {
		var req nsRequest

		if err := e.conn.ReadJSON(&req); err != nil {
			log.Println("nsexport-ws: error reading inbound json:", err)
			break
		}

		log.Println("nsexport-ws:", req.Op, "operation from", e.remoteAddr)
		res := processNsRequest(e.root, req)
		log.Println("nsexport-ws: op ok:", res.Ok)

		if err := e.conn.WriteJSON(&res); err != nil {
			log.Println("nsexport-ws: error writing outbound json:", err, res)
			break
		}
	}

	log.Println("nsexport-ws: completed loop for", e.remoteAddr)
}
