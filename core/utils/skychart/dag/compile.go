package dag

import (
	"strings"

	"github.com/stardustapp/core/extras"
)

// TODO: automatically build multibind mounts?

func (graph *Graph) Compile() bool {
	// Graphs start with a virtual root node
	graph.nodes["root"] = &Node{
		id:        "root",
		nodeType:  "Root",
		mountPath: "/",
	}

	// Create dependencies between nodes
	for _, node := range graph.nodes {
		if node.nodeType != "Entry" {
			continue
		}

		// TODO: this is only if the deviceUri is chart-local
		var parent *Node = graph.nodes["root"]
		for _, iter := range graph.nodes {
			if len(iter.mountPath) > len(parent.mountPath) {
				if strings.HasPrefix(node.deviceUri, iter.mountPath) {
					parent = iter
				}
			}
		}

		//log.Println("Node", node.mountPath, "depends on", parent.mountPath)
		edgeId := extras.GenerateId()
		graph.edges[edgeId] = &Edge{
			id:           edgeId,
			upstreamId:   parent.id,
			downstreamId: node.id,
		}
	}

	return true
}
