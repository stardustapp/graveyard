package skylink

import (
	"errors"
	"log"
	"time"

	"gopkg.in/resty.v0"
)

// Context for a stateless HTTP-based NS client
type nsHttpClient struct {
	endpoint string
}

func (svc *nsHttpClient) init() error {
	_, err := svc.exec(nsRequest{
		Op: "ping",
	})
	return err
}

func (svc *nsHttpClient) exec(req nsRequest) (res nsResponse, err error) {
	resty.SetTimeout(time.Duration(30 * time.Second))

	resp, err := resty.R(). // SetAuthToken
				SetHeader("Accept", "application/json").
				SetHeader("Content-Type", "application/json").
				SetBody(&req).
				SetResult(&res).
				Post(svc.endpoint)

	if resp.StatusCode() < 200 || resp.StatusCode() > 399 {
		log.Println("got", resp.StatusCode(), "from", svc.endpoint)
		err = errors.New("Error HTTP status code")
	} else if err != nil && res.Ok != true {
		err = errors.New("NS Export server response wasn't okay")
	}
	return
}
