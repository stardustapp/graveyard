package dag

import (
	"strings"

	"github.com/stardustapp/core/base"
)

func InflateGraphFromConfig(ctx base.Context) *Graph {
	dag := &Graph{
		name:  ctx.Name(),
		nodes: make(map[string]*Node),
		edges: make(map[string]*Edge),
	}

	entriesFolder, _ := ctx.GetFolder("/entries")
	for _, id := range entriesFolder.Children() {
		entryEnt, _ := entriesFolder.Fetch(id)
		entryFolder := entryEnt.(base.Folder)
		dag.nodes[id] = inflateEntryNode(entryFolder)
	}

	return dag
}

func inflateEntryNode(folder base.Folder) *Node {
	node := &Node{
		id:       folder.Name(),
		nodeType: "Entry",
	}

	if mountPath, ok := folder.Fetch("mount-path"); ok {
		node.mountPath = strings.TrimSuffix(mountPath.(base.String).Get(), "/")
	}
	if deviceType, ok := folder.Fetch("device-type"); ok {
		// TODO: validate against enum? look up custom types?
		node.deviceType = deviceType.(base.String).Get()
	}
	if deviceUri, ok := folder.Fetch("device-uri"); ok {
		node.deviceUri = strings.TrimSuffix(deviceUri.(base.String).Get(), "/")
	}

	return node
}
