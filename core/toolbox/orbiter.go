package toolbox

import (
	"errors"
	"log"
	"net/url"
	"strings"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
	"github.com/stardustapp/core/skylink"
)

func NewOrbiter(nsPrefix string) *Orbiter {
	log.Println("Creating Stardust Orbiter...")
	root := inmem.NewFolderOf("/",
		inmem.NewFolder("mnt"),
	)
	ns := base.NewNamespace(nsPrefix, root)
	ctx := base.NewRootContext(ns)
	log.Println("Created Stardust Orbiter, prefixed", nsPrefix)
	return &Orbiter{ctx}
}

func NewRemoteOrbiter(nsPrefix, skyLinkUri string) *Orbiter {
	log.Println("Creating Stardust Remote Orbiter...")
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
	base.Context
}

func (o *Orbiter) GetContextFor(subPath string) base.Context {
	subPath = strings.TrimSuffix(subPath, "/")
	ok := Mkdirp(o, subPath)
	if !ok {
		log.Println("orbiter: Failed to mkdirp subpath", subPath, "for chrooting")
		return nil
	}

	newRoot, ok := o.Get(subPath)
	if !ok {
		log.Println("orbiter: Failed to select subpath", subPath, "for chrooting")
		return nil
	}

	ns := base.NewNamespace("noroot://"+subPath, newRoot)
	ctx := base.NewRootContext(ns)
	return ctx
}

// Expose the API via Skylink
func (o *Orbiter) ExportPath(exportRoot string) {
	log.Println("Starting orbiter nsexport...")
	exportBase, _ := o.Get(exportRoot)
	skylink.NsexportFunc(o, exportBase)
}

func (o *Orbiter) MountURI(uriString, mountPoint string) error {
	uri, err := url.Parse(uriString)
	if err != nil {
		log.Println("Remote Device URI parsing failed on", uriString)
		return err
	}

	log.Println("Importing", uri.Scheme, uri.Host)
	innerScheme := strings.TrimPrefix(uri.Scheme, "skylink+")
	var ent base.Entry
	switch uri.Scheme {

	case "skylink+http", "skylink+https":
		actualUri := innerScheme + "://" + uri.Host + "/~~export"
		ent = skylink.ImportUri(actualUri)

	case "skylink+ws", "skylink+wss":
		actualUri := innerScheme + "://" + uri.Host + "/~~export/ws"
		ent = skylink.ImportUri(actualUri)

	default:
		return errors.New("Orbiter can't mount URI Scheme " + uri.Scheme)
	}

	if ent == nil {
		return errors.New("Orbiter got nil when importing URI " + uriString)
	}

	// walk down the path as needed
	ns := base.NewNamespace("noroot://", ent)
	ctx := base.NewRootContext(ns)
	ent, ok := ctx.GetFolder(uri.Path)
	if !ok {
		return errors.New("Imported NS was missing subpath, from " + mountPoint)
	}

	if ok := o.Put(mountPoint, ent); !ok {
		return errors.New("Failed to put imported NS at " + mountPoint)
	}
	return nil
}
