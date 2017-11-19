package skylink

import (
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/extras"
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
		svc:    ns,
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
	svc      *nsexport
	public   base.Entry
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
		root:   base.NewRootContext(ns),
		conn:   conn,
		stopCs: make(map[int]chan<- struct{}),

		remoteAddr:    r.RemoteAddr,
		chanDispenser: extras.NewIntDispenser(),
	}
	go client.loop()
}

// Context for a stateful client connection
type nsexportWs struct {
	broker *nsexportWsBroker
	root   base.Context
	conn   *websocket.Conn
	stopCs map[int]chan<- struct{}

	mutexW        sync.Mutex
	remoteAddr    string
	chanDispenser *extras.IntDispenser
}

func (e *nsexportWs) loop() {
	for {
		var req nsRequest

		if err := e.conn.ReadJSON(&req); err != nil {
			log.Println("nsexport-ws: error reading inbound json:", err)
			break
		}

		var res nsResponse
		if req.Op == "stop" {
			chanId := strings.Split(req.Path, "/")[2]
			log.Println("nsexport-ws: got stop operation on channel", chanId)

			chanNum, err := strconv.Atoi(chanId)
			stopChan, ok := e.stopCs[chanNum]
			if err == nil && ok {
				res.Ok = true
				delete(e.stopCs, chanNum)
				log.Println("nsexport-ws: requested close of channel", chanNum)
				close(stopChan)
			} else {
				log.Println("WARN: nsexport-ws: failed to find chan", chanId, "to stop")
			}

		} else {
			res = processNsRequest(e.root, req)
		}

		log.Println("nsexport-ws:", req.Op, "op on", req.Path, "from", e.remoteAddr, "was ok:", res.Ok)

		// If there's a channel being set up, let's plumb it
		// TODO: support failure
		if res.Channel != nil {
			// assign an ID
			res.Chan = <-e.chanDispenser.C
			e.stopCs[res.Chan] = res.StopC

			// pump outbound packets
			extras.MetricIncr("skylink.channel.opened", "op:"+req.Op, "transport:ws")
			go func(op string, id int, c <-chan nsResponse, stopC chan<- struct{}) {
				log.Println("nsexport-ws: Running channel exporter on #", id)
				defer log.Println("nsexport-ws: Stopped channel exporter on #", id)

				// to prevent double-closing in the wire proto
				// this is true until
				stillLive := true

				for packet := range c {
					packet.Chan = id
					log.Println("nsexport-ws: Channel #", id, "passed a", packet.Status)
					extras.MetricIncr("skylink.channel.packet", "op:"+op, "transport:ws", "status:"+packet.Status)
					e.mutexW.Lock()
					if err := e.conn.WriteJSON(&packet); err != nil {
						log.Println("nsexport-ws: error writing outbound channel packet:", err, packet)
						close(stopC)
						stillLive = false
						e.mutexW.Unlock()
						extras.MetricIncr("skylink.channel.closed", "op:"+op, "transport:ws", "closereason:write-error", "status:"+packet.Status)
						break
					}

					if packet.Status != "Next" {
						close(stopC)
						stillLive = false
						e.mutexW.Unlock()
						extras.MetricIncr("skylink.channel.closed", "op:"+op, "transport:ws", "closereason:manual", "status:"+packet.Status)
						break
					}
					e.mutexW.Unlock()
				}

				if stillLive {
					log.Println("nsexport-ws: Auto-closing channel #", id)
					close(stopC)

					packet := &nsResponse{
						Chan:   id,
						Status: "Done",
					}
					extras.MetricIncr("skylink.channel.packet", "op:"+op, "transport:ws", "status:"+packet.Status)
					e.mutexW.Lock()
					if err := e.conn.WriteJSON(&packet); err != nil {
						log.Println("nsexport-ws: error writing outbound channel Done packet:", err, packet)
					}
					e.mutexW.Unlock()

					extras.MetricIncr("skylink.channel.closed", "op:"+op, "transport:ws", "closereason:auto")
				}

				// continue pumping into /dev/null to prevent buffer jams
				// TODO: actually cascade the close upstream
				for _ = range c {
					log.Println("WARN: tossing packet for closed downstream channel", id)
					extras.MetricIncr("skylink.channel.spillover", "op:"+op, "transport:ws", "closereason:auto")
				}
			}(req.Op, res.Chan, res.Channel, res.StopC)
		}

		// rewrite statuses
		if res.Status == "" {
			if res.Ok {
				res.Status = "Ok"
			} else {
				res.Status = "Failed"
			}
		}

		e.mutexW.Lock()
		if err := e.conn.WriteJSON(&res); err != nil {
			log.Println("nsexport-ws: error writing outbound json:", err, res)
			e.mutexW.Unlock()
			break
		}
		e.mutexW.Unlock()
	}

	log.Println("nsexport-ws: completed loop for", e.remoteAddr)

	log.Println("nsexport-ws: completed loop for", e.remoteAddr)
}
