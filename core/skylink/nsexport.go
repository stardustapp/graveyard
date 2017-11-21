package skylink

import (
	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
)

// Directory containing the clone function
func GetNsexportDriver() base.Folder {
	return inmem.NewFolderOf("nsexport",
		inmem.NewFunction("invoke", NsexportFunc),
	).Freeze()
}

// Context containing the root API that gets published
// This doesn't include the states that are maintained by e.g. websockets
type nsexport struct {
	ctx  base.Context
	root base.Context
}

// Function that creates a new HTTP server when invoked
func NsexportFunc(ctx base.Context, input base.Entry) (output base.Entry) {
	ns := base.NewNamespace("starns://apt.danopia.net", input.(base.Folder))
	ctx2 := base.NewRootContext(ns)

	svc := &nsexport{
		root: ctx2, //input.(base.Folder),
		ctx:  ctx,
	}

	NewHttpBroker(svc, "/~~export")
	NewWsBroker(svc, "/~~export/ws")
	NewPingBroker(svc, "/~~export/ping")

	// surely this can be in a better spot
	go stackDumpOnSiqQuit()

	return nil // svc.tmpFolder
}
