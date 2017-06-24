package drivers

import (
	"errors"
	"sync"

	"github.com/gorilla/websocket"
)

// Context for a stateful Websocket-based NS client
type nsWebsocketClient struct {
	endpoint string
	conn     *websocket.Conn
	mutex    sync.Mutex
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
	return nil
}

func (svc *nsWebsocketClient) exec(req nsRequest) (res nsResponse, err error) {
	if svc.conn == nil {
		return res, errors.New("nsimport-ws use-before-init for " + svc.endpoint)
	}

	svc.mutex.Lock()
	defer svc.mutex.Unlock()

	svc.conn.WriteJSON(req)
	err = svc.conn.ReadJSON(&res)
	return
}
