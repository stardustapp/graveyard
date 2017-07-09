package dag

import (
	"fmt"
	"log"
	"net/url"
	"strings"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
	"github.com/stardustapp/core/toolbox"
)

func (g *Graph) Launch(ctx base.Context) base.Entry {
	log.Println("=== == === == === == === == === === == === == ===")
	log.Println("Launching", g.name)

	// Created entries go here, to mark progress
	nodeEnts := make(map[string]base.Entry)

	// Build set of nodes that must be ready before each node can launch
	nodeDeps := make(map[string][]string)
	for _, node := range g.nodes {
		var deps []string
		for _, edge := range g.edges {
			if edge.downstreamId == node.id {
				deps = append(deps, edge.upstreamId)
			}
		}
		nodeDeps[node.id] = deps
	}

	root := inmem.NewFolder("skylink://" + g.name + ".chart.local")
	ns := base.NewNamespace(root.Name(), root)
	cCtx := base.NewRootContext(ns)
	nodeEnts["root"] = root

	for {
		// Find an entry that's ready
		var node *Node
	SelectNode:
		for id, deps := range nodeDeps {
			if _, ready := nodeEnts[id]; ready {
				continue SelectNode
			}
			for _, dep := range deps {
				if _, ready := nodeEnts[dep]; !ready {
					continue SelectNode
				}
			}
			node = g.nodes[id]
		}

		if node == nil {
			log.Println("no node was ready. all done, i guess")
			break
		}

		log.Println("Next node:", node.mountPath, node.nodeType)

		if ok := toolbox.Mkdirp(cCtx, node.mountPath); !ok {
			log.Println("mkdirp on", node.mountPath, "failed, aborting launch")
			return nil
		}

		uri, err := url.Parse(node.deviceUri)
		if err != nil {
			log.Println("deviceUri parsing failed.", node.deviceUri, err)
			return nil
		}

		// TODO
		var ent base.Entry
		switch node.nodeType {

		case "Import":
			log.Println("Importing", uri.Scheme, uri.Host)
			switch uri.Scheme {

			case "skylink+http", "skylink+https":
				actualUri := strings.TrimPrefix(node.deviceUri, "skylink+") + "/~~export"
				importFunc, _ := ctx.GetFunction("/drivers/nsimport/invoke")
				ent = importFunc.Invoke(ctx, inmem.NewFolderOf("opts",
					inmem.NewString("endpoint-url", actualUri),
				))

			case "skylink+ws", "skylink+wss":
				actualUri := strings.TrimPrefix(node.deviceUri, "skylink+") + "/~~export/ws"
				importFunc, _ := ctx.GetFunction("/drivers/nsimport/invoke")
				ent = importFunc.Invoke(ctx, inmem.NewFolderOf("opts",
					inmem.NewString("endpoint-url", actualUri),
				))

			}

		case "Entry":
			log.Printf("%+v %s", node, uri.Path)

			var device base.Entry
			switch uri.Scheme {

			// case "":

			case "skylink+http", "skylink+https", "skylink+ws", "skylink+wss":
				mountPath := fmt.Sprintf("/mnt/%s/%s", uri.Scheme, uri.Host)
				var ok bool
				device, ok = cCtx.Get(mountPath + uri.Path)
				if !ok {
					log.Println("mount path", mountPath, "doesn't exist")
					return nil
				}

			case "":
				// relative path
				var ok bool
				device, ok = cCtx.Get(uri.Path)
				if !ok {
					log.Println("relative device path", uri.Path, "doesn't exist")
					return nil
				}

			default:
				log.Fatalln("Unknown device scheme", uri.Scheme)

			}

			if device == nil {
				log.Println("device from", uri, "wasn't found")
				return nil
			}

			switch node.deviceType {

			case "BindLink":
				ent = device // lol

			case "StarDriver":
				driverAddr := resolveStarDriver(node.deviceUri)
				log.Println("driver is at", driverAddr)

				actualUri := fmt.Sprintf("ws://%s/~~export/ws", driverAddr)
				importFunc, _ := ctx.GetFunction("/drivers/nsimport/invoke")
				rawEnt := importFunc.Invoke(ctx, inmem.NewFolderOf("opts",
					inmem.NewString("endpoint-url", actualUri),
				))

				if rawEnt, ok := rawEnt.(base.Folder); ok {
					ent, _ = rawEnt.Fetch("pub")
				} else {
					log.Println("stardriver at", driverAddr, "didn't import")
					return nil
				}

			default:
				log.Fatalln("Unknown device type", node.deviceType)

			}

		default:
			log.Fatalln("Unknown node type", node.nodeType)

		}

		if ent == nil {
			log.Println("launch of", node.mountPath, "failed, aborting launch")
			return nil
		}
		nodeEnts[node.id] = ent
		if ok := cCtx.Put(node.mountPath, ent); !ok {
			log.Println("put on", node.mountPath, "failed, aborting launch")
			return nil
		}
	}

	// log.Fatalln("Done launching. dying, thx")
	return root
}
