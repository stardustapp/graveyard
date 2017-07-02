package skylink

import (
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
	// TODO: store a link to ctx if it's rooted, don't always convert
	resp, err := e.svc.transport.exec(nsRequest{
		Op:    "store",
		Dest:  e.prefix + "/" + name,
		Input: convertEntryToApi(child),
	})
	if err != nil {
		log.Println("nsimport folder put err:", err)
		return false
	}

	return resp.Ok
}
