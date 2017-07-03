package toolbox

import (
	"log"
	"strings"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
	"github.com/stardustapp/core/skylink"
)

func NewOrbiter(nsPrefix, skyLinkUri string) *Orbiter {
	log.Println("Creating Stardust Orbiter...")
	root := inmem.NewFolderOf("/",
		inmem.NewFolderOf("drivers",
			skylink.GetNsimportDriver(),
			skylink.GetNsexportDriver(),
		),
	)
	ns := base.NewNamespace(nsPrefix, root)
	ctx := base.NewRootContext(ns)

	log.Println("Launching nsimport...")
	importFunc, _ := ctx.GetFunction("/drivers/nsimport/invoke")
	remoteFs := importFunc.Invoke(ctx, inmem.NewFolderOf("opts",
		inmem.NewString("endpoint-url", skyLinkUri),
	))

	ctx.Put("/mnt", remoteFs)
	//root.Freeze()

	log.Println("Orbiter launched")
	return &Orbiter{ctx}
}

type Orbiter struct {
	ctx base.Context
}

func (o *Orbiter) GetContextFor(subPath string) base.Context {
	subPath = strings.TrimSuffix(subPath, "/")
	ok := Mkdirp(o.ctx, subPath)
	if !ok {
		log.Println("orbiter: Failed to mkdirp subpath", subPath, "for chrooting")
		return nil
	}

	newRoot, ok := o.ctx.Get(subPath)
	if !ok {
		log.Println("orbiter: Failed to select subpath", subPath, "for chrooting")
		return nil
	}

	ns := base.NewNamespace("noroot://"+subPath, newRoot)
	ctx := base.NewRootContext(ns)
	return ctx
}
