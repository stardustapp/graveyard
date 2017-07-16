package dag

import (
	"strings"

	"github.com/stardustapp/core/base"
)

func InflateGraphFromConfig(ctx base.Context) *Graph {
	rootNode, _ := ctx.GetFolder("/")
	dag := &Graph{
		name:  rootNode.Name(),
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
		NodeType: "Entry",
	}

	if mountPath, ok := folder.Fetch("mount-path"); ok {
		node.MountPath = strings.TrimSuffix(mountPath.(base.String).Get(), "/")
	}
	if deviceType, ok := folder.Fetch("device-type"); ok {
		// TODO: validate against enum? look up custom types?
		node.DeviceType = deviceType.(base.String).Get()
	}
	if deviceUri, ok := folder.Fetch("device-uri"); ok {
		node.DeviceUri = strings.TrimSuffix(deviceUri.(base.String).Get(), "/")
	}
	if deviceInput, ok := folder.Fetch("device-input"); ok {
		node.DeviceInput = deviceInput
	}

	return node
}
