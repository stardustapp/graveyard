package skylink

import (
	"errors"
	"log"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
)

type importedString struct {
	svc  *nsimport
	path string
	*inmem.String
}

var _ base.String = (*importedString)(nil)

// Support subscription passthrough
var _ Subscribable = (*importedString)(nil)

// TODO: DRY this the fuck up
func (e *importedString) Subscribe(s *Subscription) (err error) {
	req := nsRequest{
		Op:    "subscribe",
		Path:  e.path,
		Depth: s.MaxDepth,
	}

	resp, err := e.svc.transport.exec(req)
	if err != nil {
		return errors.New("nsimport string subscribe err:")
	}

	if resp.Channel != nil {
		go func(inC <-chan nsResponse, outC chan<- Notification) {
			log.Println("imported-string: Starting subscription pump from", e.path)
			for {
				switch {
				case pkt, ok := <-inC {
					if !ok {
						log.Println("imported-folder: Propogating sub close downstream")
						break
					}

					if pkt.Output == nil {
						log.Println("imported-string WARN: sub got a packet without an output.", pkt)
						break
					}
					if pkt.Output.Name != "notif" {
						log.Println("imported-string WARN: sub got a non-notif packet:", pkt.Output.Name)
						break
					}

					switch pkt.Status {
					case "Next":
						var notif Notification
						for _, field := range pkt.Output.Children {
							switch field.Name {
							case "type":
								notif.Type = field.StringValue
							case "path":
								notif.Path = field.StringValue
							case "entry":
								notif.Entry = convertEntryFromApi(&field)
							default:
								log.Println("imported-string WARN: sub got weird Next field,", field.Name)
							}
						}
						log.Println("imported-string: sub notification:", notif)
						outC <- notif

						// any non-Next status is terminal
					default:
						log.Println("imported-string: sub got unknown packet", pkt.Status)
					}

				case <-stopC:
					log.Println("imported-string: Propogating sub stop upstream")
					resp, err := e.svc.transport.exec(nsRequest{
						Op:    "stop",
						Path:  fmt.Sprintf("/chan/%s", res.Chan),
					})
					if err != nil {
						return errors.New("nsimport string stop err:", err)
					}
					break

				}
			}
			log.Println("imported-string: Completed subscription pump from", e.path)
			close(outC)
		}(resp.Channel, s.streamC)
	}

	if resp.Status == "Ok" {
		return nil
	} else if resp.Output != nil && resp.Output.Type == "String" {
		return errors.New("Subscription failed. Cause: " + resp.Output.StringValue)
	} else {
		return errors.New("Subscription attempt wasn't Ok, was " + resp.Status)
	}
}
