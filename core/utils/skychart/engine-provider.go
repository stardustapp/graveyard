package main

import (
	"fmt"
	"log"
	"net/url"
	"strings"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
	"github.com/stardustapp/core/skylink"
	"github.com/stardustapp/core/utils/skychart/dag"
)

func (e *Engine) InjectNode(ctx base.Context, node *dag.Node) base.Entry {

	// EmptyDirs are really like an Import to an implicit device
	if node.NodeType == "Entry" && node.DeviceType == "EmptyDir" {
		// TODO: can we work chart name in there??
		statePath := "/directories/" + node.Id
		if _, ok := e.dataCtx.GetFolder(statePath); !ok {
			if ok := e.dataCtx.Put(statePath, inmem.NewFolder(node.Id)); !ok {
				panic("Failed to create EmptyDir folder at " + statePath)
			}
			log.Println("Created EmptyDir at", statePath)
		}

		ent, _ := e.dataCtx.Get(statePath)
		return ent
	}

	// Devices always come from somewhere. Require a valid URI.
	uri, err := url.Parse(node.DeviceUri)
	if err != nil {
		log.Println("DeviceUri parsing failed.", node.DeviceUri, err)
		return nil
	}

	// TODO
	switch node.NodeType {

	case "Import":
		log.Println("Importing", uri.Scheme, uri.Host)
		switch uri.Scheme {

		case "skylink+http", "skylink+https":
			actualUri := strings.TrimPrefix(node.DeviceUri, "skylink+") + "/~~export"
			return skylink.ImportUri(actualUri)

		case "skylink+ws", "skylink+wss":
			actualUri := strings.TrimPrefix(node.DeviceUri, "skylink+") + "/~~export/ws"
			return skylink.ImportUri(actualUri)

		case "skylink":
			names := strings.Split(uri.Host, ".")
			if len(names) == 3 && names[2] == "local" && names[1] == "chart" {
				chart := e.findChart(names[0])
				return e.launchChart(chart)
			} else {
				log.Println("Unknown skylink import hostname", uri.Host)
				return nil
			}

		default:
			log.Println("Unknown import node scheme", uri.Scheme)
			return nil
		}

	case "Entry":
		log.Printf("%+v %s", node, uri.Path)

		var device base.Entry
		if uri.Scheme != "" {
			// schemed devices should be properly mounted already
			MountPath := fmt.Sprintf("/mnt/%s/%s", uri.Scheme, uri.Host)
			var ok bool
			device, ok = ctx.Get(MountPath + uri.Path)
			if !ok {
				log.Println("mount path", MountPath+uri.Path, "doesn't exist")
				return nil
			}
		} else {
			// relative path, refers within the chart
			var ok bool
			device, ok = ctx.Get(uri.Path)
			if !ok {
				log.Println("relative device path", uri.Path, "doesn't exist")
				return nil
			}
		}

		if device == nil {
			log.Println("device from", uri, "wasn't found")
			return nil
		}

		switch node.DeviceType {

		case "BindLink":
			return device // lol

		case "ActiveMount":
			if deviceFunc, ok := device.(base.Function); ok {
				log.Printf("Device at %s is a legacy Function, please update sometime.", node.DeviceUri)
				return deviceFunc.Invoke(ctx, node.DeviceInput)

			} else if functionShape.Check(ctx, device) {
				if deviceFunc, ok := device.(base.Folder).Fetch("invoke"); ok {
					return deviceFunc.(base.Function).Invoke(ctx, node.DeviceInput)
				}
			}

			log.Printf("Device at %s was not a Function, can't mount it.", node.DeviceUri)
			return nil

		default:
			log.Println("Unknown device type", node.DeviceType)
			return nil

		}

	default:
		log.Println("Unknown node type", node.NodeType)
		return nil

	}
}

// The Shape of devices that can be used as mounts
var functionShape *inmem.Shape = inmem.NewShape(
	inmem.NewFolderOf("function",
		inmem.NewString("type", "Folder"),
		inmem.NewFolderOf("props",
			inmem.NewString("invoke", "Function"),
			inmem.NewFolderOf("input-shape",
				inmem.NewString("type", "Shape"),
				inmem.NewString("optional", "yes"),
			),
			inmem.NewFolderOf("output-shape",
				inmem.NewString("type", "Shape"),
				inmem.NewString("optional", "yes"),
			),
		),
	))
