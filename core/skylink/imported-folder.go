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
  req := nsRequest{
		Op:    "store",
		Dest:  e.prefix + "/" + name,
	}

  if child == nil {
    req.Op = "unlink"
    req.Path = req.Dest
    req.Dest = ""
  } else if iChild, ok := child.(*importedFolder); ok {
    if iChild.svc == e.svc {
      log.Println("Putting", name, "from same nsimport")
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
