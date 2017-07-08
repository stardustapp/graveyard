package dag

import (
	"fmt"
	"log"
	"net/url"
	"strings"

	"github.com/stardustapp/core/extras"
)

// TODO: automatically build multibind mounts?

func (g *Graph) getImportNode(uri string) *Node {
	// check if the import already exists
	for _, node := range g.nodes {
		if node.nodeType == "Import" && node.deviceUri == uri {
			return node
		}
	}

	// create new import node
	node := &Node{
		id:         extras.GenerateId(),
		nodeType:   "Import",
		mountPath:  "/mnt/" + strings.Replace(uri, "/", "-", -1),
		deviceType: "ActiveMount",
		deviceUri:  uri,
	}
	g.nodes[node.id] = node

	// depend on the root node
	edgeId := extras.GenerateId()
	g.edges[edgeId] = &Edge{
		id:           edgeId,
		upstreamId:   "root",
		downstreamId: node.id,
	}

	return node
}

func (g *Graph) Compile() bool {
	// Graphs start with a virtual root node
	g.nodes["root"] = &Node{
		id:         "root",
		nodeType:   "Root",
		mountPath:  "/",
		deviceType: "EmptyDir",
	}

	// Create dependencies between nodes
	for _, node := range g.nodes {
		if node.nodeType != "Entry" {
			continue
		}

		var parent *Node = g.nodes["root"]
		if strings.Contains(node.deviceUri, "://") {
			u, err := url.Parse(node.deviceUri)
			if err != nil {
				log.Println("deviceUri parsing failed.", err)
				continue
			}
			parent = g.getImportNode(fmt.Sprintf("%s://%s", u.Scheme, u.Host))

		} else {
			for _, iter := range g.nodes {
				if len(iter.mountPath) > len(parent.mountPath) {
					if strings.HasPrefix(node.deviceUri, iter.mountPath) {
						parent = iter
					}
				}
			}
		}

		//log.Println("Node", node.mountPath, "depends on", parent.mountPath)
		edgeId := extras.GenerateId()
		g.edges[edgeId] = &Edge{
			id:           edgeId,
			upstreamId:   parent.id,
			downstreamId: node.id,
		}
	}

	return true
}
