package main

import (
	"fmt"
	"log"
	"net/url"
	"strings"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/skylink"
	"github.com/stardustapp/core/utils/skychart/dag"
)

func (e *Engine) InjectNode(ctx base.Context, node *dag.Node) base.Entry {
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
		switch uri.Scheme {

		// case "":

		case "skylink+http", "skylink+https", "skylink+ws", "skylink+wss", "skylink":
			MountPath := fmt.Sprintf("/mnt/%s/%s", uri.Scheme, uri.Host)
			var ok bool
			device, ok = ctx.Get(MountPath + uri.Path)
			if !ok {
				log.Println("mount path", MountPath, "doesn't exist")
				return nil
			}

		case "":
			// relative path
			var ok bool
			device, ok = ctx.Get(uri.Path)
			if !ok {
				log.Println("relative device path", uri.Path, "doesn't exist")
				return nil
			}

		default:
			log.Println("Unknown device scheme", uri.Scheme)
			return nil

		}

		if device == nil {
			log.Println("device from", uri, "wasn't found")
			return nil
		}

		switch node.DeviceType {

		case "BindLink":
			return device // lol

		case "StarDriver":
			driverAddr := resolveStarDriver(node.DeviceUri)
			log.Println("driver is at", driverAddr)

			actualUri := fmt.Sprintf("ws://%s/~~export/ws", driverAddr)
			rawEnt := skylink.ImportUri(actualUri)
			if rawEnt, ok := rawEnt.(base.Folder); ok {
				ent, _ := rawEnt.Fetch("pub")
				return ent
			} else {
				log.Println("stardriver at", driverAddr, "didn't import")
				return nil
			}

			//case "ActiveMount":

		default:
			log.Println("Unknown device type", node.DeviceType)
			return nil

		}

	default:
		log.Println("Unknown node type", node.NodeType)
		return nil

	}
}
