package skylink

import (
	"errors"
	"fmt"
	"log"

	"github.com/stardustapp/core/base"
)

type importedFolder struct {
	svc      *nsimport
	prefix   string
	name     string
	children []nsEntry
}

var _ base.Folder = (*importedFolder)(nil)

func (e *importedFolder) Name() string {
	return e.name
}

func (e *importedFolder) Children() []string {
	names := make([]string, len(e.children))
	for idx, child := range e.children {
		names[idx] = child.Name
	}
	return names
}

func (e *importedFolder) Fetch(name string) (child base.Entry, ok bool) {
	child, err := e.svc.getEntry(e.prefix + "/" + name)
	if err != nil {
		log.Println("nsimport: fetch", name, ":", err.Error())
	}
	return child, err == nil
}

func (e *importedFolder) Put(name string, child base.Entry) (ok bool) {
	req := nsRequest{
		Op:   "store",
		Dest: e.prefix + "/" + name,
	}

	if child == nil {
		req.Op = "unlink"
		req.Path = req.Dest
		req.Dest = ""
	} else if iChild, ok := child.(*importedFolder); ok {
		if iChild.svc == e.svc {
			log.Println("Putting", name, "from same nsimport")
			req.Op = "copy"
			req.Path = iChild.prefix + "/" + iChild.name
		} else {
			log.Println("Putting", name, "from diff nsimport via copy")
			req.Input = convertEntryToApi(child)
		}
	} else {
		// TODO: store a link to ctx if it's rooted, don't always convert
		log.Println("Putting", name, "from non-imported source via copy")
		req.Input = convertEntryToApi(child)
	}

	resp, err := e.svc.transport.exec(req)
	if err != nil {
		log.Println("nsimport folder put err:", err)
		return false
	}

	return resp.Ok
}

// Support enumeration passthrough

var _ Enumerable = (*importedFolder)(nil)

func (e *importedFolder) Enumerate(enum *Enumerator, depth int) []nsEntry {
	maxDepth := enum.maxDepth
	if maxDepth != -1 {
		maxDepth -= depth
	}

	req := nsRequest{
		Op:    "enumerate",
		Path:  e.prefix,
		Depth: maxDepth,
		// Shapes:
	}

	resp, err := e.svc.transport.exec(req)
	if err != nil {
		log.Println("nsimport folder enumerate err:", err)
	}

	if !resp.Ok || resp.Output == nil {
		log.Println("remote skylink for", e.prefix, "failed to enumerate")
		return nil
	}
	return resp.Output.Children
}

var _ Subscribable = (*importedFolder)(nil)

func (e *importedFolder) Subscribe(s *Subscription) (err error) {
	req := nsRequest{
		Op:    "subscribe",
		Path:  e.prefix,
		Depth: s.MaxDepth,
	}

	resp, err := e.svc.transport.exec(req)
	if err != nil {
		return errors.New("nsimport folder subscribe err:")
	}

	if resp.Channel != nil {
		go func(inC <-chan nsResponse, outC chan<- Notification, stopC <-chan struct{}) {
			log.Println("imported-folder: Starting subscription pump from", e.prefix)
		feedLoop:
			for {
				select {
				case pkt, ok := <-inC:
					if !ok {
						log.Println("imported-folder: Propagating sub close downstream")
						break feedLoop
					}

					if pkt.Output != nil && pkt.Output.Name == "notif" {
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
								log.Println("imported-folder WARN: sub got weird Next field,", field.Name)
							}
						}
						log.Println("imported-folder: sub notification:", notif)
						outC <- notif
					}

					// the above assumes that the remote can't double-terminate,
					// and will close immediately after any terminal event

				case <-stopC:
					log.Println("imported-folder: Propagating sub stop upstream")
					resp, err := e.svc.transport.exec(nsRequest{
						Op:   "stop",
						Path: fmt.Sprintf("/chan/%d", resp.Chan),
					})
					if err != nil {
						log.Println("WARN: nsimport folder stop err:", err)
					} else {
						log.Println("nsimport folder stop happened:", resp)
					}
					// stop checking the stop chan, just finish out the main chan
					stopC = nil

				}
			}
			log.Println("imported-folder: Completed subscription pump from", e.prefix)
			close(outC)
		}(resp.Channel, s.StreamC, s.StopC)
	}

	if resp.Status == "Ok" {
		return nil
	} else if resp.Output != nil && resp.Output.Type == "String" {
		return errors.New("Subscription failed. Cause: " + resp.Output.StringValue)
	} else {
		return errors.New("Subscription attempt wasn't Ok, was " + resp.Status)
	}
}
