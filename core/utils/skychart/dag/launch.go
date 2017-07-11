package dag

import (
	"log"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
	"github.com/stardustapp/core/toolbox"
)

type Provider interface {
	InjectNode(ctx base.Context, node *Node) base.Entry
}

func (g *Graph) Launch(provider Provider) base.Entry {
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

		log.Println("Next node:", node.MountPath, node.NodeType)

		if ok := toolbox.Mkdirp(cCtx, node.MountPath); !ok {
			log.Println("mkdirp on", node.MountPath, "failed, aborting launch")
			return nil
		}

		ent := provider.InjectNode(cCtx, node)

		if ent == nil {
			log.Println("launch of", node.MountPath, "failed, aborting launch")
			return nil
		}
		nodeEnts[node.id] = ent
		if ok := cCtx.Put(node.MountPath, ent); !ok {
			log.Println("put on", node.MountPath, "failed, aborting launch")
			return nil
		}
	}

	// log.Fatalln("Done launching. dying, thx")
	return root
}
