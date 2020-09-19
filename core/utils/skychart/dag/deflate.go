package dag

import (
	"github.com/stardustapp/core/inmem"
)

func (g *Graph) GetFolder() *inmem.Folder {
	nodes := inmem.NewFolder("nodes")
	for _, node := range g.nodes {
		nodes.Put(node.Id, node.getFolder().Freeze())
	}

	edges := inmem.NewFolder("edges")
	for _, edge := range g.edges {
		edges.Put(edge.id, edge.getFolder().Freeze())
	}

	return inmem.NewFolderOf("dag",
		nodes.Freeze(),
		edges.Freeze(),
		g.CreateVisualizationPage(),
	).Freeze()
}

func (n *Node) getFolder() *inmem.Folder {
	// TODO: export special nodes too
	return inmem.NewFolderOf(n.Id,
		inmem.NewString("mount-path", n.MountPath),
		inmem.NewString("device-type", n.DeviceType),
		inmem.NewString("device-uri", n.DeviceUri),
	)
}

func (e *Edge) getFolder() *inmem.Folder {
	return inmem.NewFolderOf(e.id,
		inmem.NewString("upstream", e.upstreamId),
		inmem.NewString("downstream", e.downstreamId),
	)
}
