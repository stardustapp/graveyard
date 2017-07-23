package dag

import (
	"fmt"
	"log"
	"net/url"
	"strings"

	"github.com/stardustapp/core/extras"
)

// TODO: automatically build multibind mounts?

func (g *Graph) getImportNode(scheme, host string) *Node {
	uri := fmt.Sprintf("%s://%s", scheme, host)

	// check if the import already exists
	for _, node := range g.nodes {
		if node.NodeType == "Import" && node.DeviceUri == uri {
			return node
		}
	}

	// create new import node
	node := &Node{
		Id:         extras.GenerateId(),
		NodeType:   "Import",
		MountPath:  fmt.Sprintf("/mnt/%s/%s", scheme, host),
		DeviceType: "ActiveMount",
		DeviceUri:  uri,
	}
	g.nodes[node.Id] = node

	// depend on the root node
	edgeId := extras.GenerateId()
	g.edges[edgeId] = &Edge{
		id:           edgeId,
		upstreamId:   "root",
		downstreamId: node.Id,
	}

	return node
}

func (g *Graph) Compile() bool {
	// Graphs start with a virtual root node
	g.nodes["root"] = &Node{
		Id:         "root",
		NodeType:   "Root",
		MountPath:  "/",
		DeviceType: "EmptyDir",
	}

	// Create dependencies between nodes
	for _, node := range g.nodes {
		if node.NodeType != "Entry" {
			continue
		}

		var parent *Node = g.nodes["root"]
		if strings.Contains(node.DeviceUri, "://") {
			u, err := url.Parse(node.DeviceUri)
			if err != nil {
				log.Println("DeviceUri parsing failed.", err)
				continue
			}
			parent = g.getImportNode(u.Scheme, u.Host)

		} else {
			for _, iter := range g.nodes {
				if len(iter.MountPath) > len(parent.MountPath) {
					if strings.HasPrefix(node.DeviceUri, iter.MountPath) {
						parent = iter
					}
				}
			}
		}

		//log.Println("Node", node.MountPath, "depends on", parent.MountPath)
		edgeId := extras.GenerateId()
		g.edges[edgeId] = &Edge{
			id:           edgeId,
			upstreamId:   parent.Id,
			downstreamId: node.Id,
		}
	}

	return true
}
