package skylink

import (
	"errors"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// Context for a stateful Websocket-based NS client
type nsWebsocketClient struct {
	endpoint string
	conn     *websocket.Conn
	mutex    sync.Mutex
	respC    chan nsResponse
	channels map[int]chan<- nsResponse
}

func (svc *nsWebsocketClient) init() error {
	var dialer = websocket.Dialer{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}

	conn, _, err := dialer.Dial(svc.endpoint, nil)
	if err != nil {
		return err
	}

	svc.conn = conn
	svc.respC = make(chan nsResponse)
	svc.channels = make(map[int]chan<- nsResponse)
	go svc.loop()

	return nil
}

func (svc *nsWebsocketClient) loop() {
	log.Println("nsimport-ws: starting inbound loop for", svc.endpoint)

	for {
		var res nsResponse

		if err := svc.conn.ReadJSON(&res); err != nil {
			log.Println("nsimport-ws: error reading inbound json:", err)
			break
		}

		// Detect and route continuations
		if res.Chan != 0 && res.Status != "Ok" {
			// find the target
			if channel, ok := svc.channels[res.Chan]; !ok {
				log.Println("nsimport-ws: received packet for missing channel:", res)
				break
			} else {
				// pass the message
				channel <- res
				if res.Status != "Next" {
					delete(svc.channels, res.Chan)
					close(channel)
				}
			}
		} else {
			// Not a continuation. Maybe it's starting a channel instead.
			if res.Chan != 0 && res.Status == "Ok" {
				log.Println("nsimport-ws: starting channel", res.Chan)
				channel := make(chan nsResponse, 5)
				svc.channels[res.Chan] = channel
				res.Channel = channel
			}

			// Pass to whatever is next in line
			svc.respC <- res
		}
	}

	log.Println("nsimport-ws: completed inbound loop for", svc.endpoint)
	close(svc.respC)
	// TODO: close subchans too
}

func (svc *nsWebsocketClient) exec(req nsRequest) (res nsResponse, err error) {
	if svc.conn == nil {
		return res, errors.New("nsimport-ws use-before-init for " + svc.endpoint)
	}

	svc.mutex.Lock()
	defer svc.mutex.Unlock()

	svc.conn.WriteJSON(req)
	res = <-svc.respC
	if !res.Ok {
		log.Println("nsimport-ws:", req.Op, "op to", req.Path, "on", svc.endpoint, "was ok:", res.Ok)
	}
	return
}
