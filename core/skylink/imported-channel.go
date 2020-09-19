package skylink

import (
	"log"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/extras"
)

type importedChannel struct {
	svc  *nsimport
	path string
	name string
}

var _ base.Channel = (*importedChannel)(nil)

func (e *importedChannel) Name() string {
	return e.name
}

func (e *importedChannel) Push(value base.Entry) (ok bool) {
	// TODO: support sending paths too
	resp, err := e.svc.transport.exec(nsRequest{
		Op:    "chan/push",
		Dest:  e.path,
		Input: convertEntryToApi(value),
	})
	if err != nil {
		log.Println("nsimport chan/push err:", err)
		return false
	}

	return resp.Ok
}

func (e *importedChannel) Close() {
	_, err := e.svc.transport.exec(nsRequest{
		Op:   "chan/close",
		Path: e.path,
	})
	if err != nil {
		log.Println("nsimport chan/close err:", err)
	}
}

// TODO: skylink-ns is syncronise so the transport will lock while a Next is blocking
func (e *importedChannel) Next() (value base.Entry, ok bool) {
	// TODO: only set dest if we want to be stateful
	dest := "/tmp/output-" + extras.GenerateId()

	resp, err := e.svc.transport.exec(nsRequest{
		Op:   "chan/next",
		Path: e.path,
		Dest: dest,
	})
	if err != nil {
		log.Println("nsimport chan/next err:", err)
		return nil, false
	}
	if !resp.Ok {
		log.Println("nsimport chan/next from", e.path, "wasn't okay")
		return nil, false
	}

	if dest == "" {
		return convertEntryFromApi(resp.Output), true
	} else {
		output, _ := e.svc.getEntry(dest)
		return output, true
	}
}

func (e *importedChannel) TryNext() (value base.Entry, ok bool) {
	// TODO: only set dest if we want to be stateful
	dest := "/tmp/output-" + extras.GenerateId()

	resp, err := e.svc.transport.exec(nsRequest{
		Op:   "chan/try-next",
		Path: e.path,
		Dest: dest,
	})
	if err != nil {
		log.Println("nsimport chan/try-next err:", err)
		return nil, false
	}
	if !resp.Ok {
		log.Println("nsimport chan/try-next from", e.path, "wasn't okay")
		return nil, false
	}

	if dest == "" {
		return convertEntryFromApi(resp.Output), true
	} else {
		output, _ := e.svc.getEntry(dest)
		return output, true
	}
}
