package dag

import (
	"bytes"
	"fmt"

	"github.com/stardustapp/core/inmem"
)

func (graph *Graph) CreateVisualizationPage() *inmem.File {
	var doc bytes.Buffer

	doc.WriteString("<!doctype html>\n")
	doc.WriteString(fmt.Sprintf("<title>%s - Skychart Graph</title>\n", graph.name))
	doc.WriteString(`
<script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/vis/4.20.0/vis.min.js"></script>
<link href="https://cdnjs.cloudflare.com/ajax/libs/vis/4.20.0/vis.min.css" rel="stylesheet" type="text/css"/>
<style>
  html {
    height: 100%;
  }
  body {
    color: #d3d3d3;
    font: 12pt arial;
    background-color: #222222;
    margin: 0;
    height: 100%;
    display: flex;
  }
  #chart-graph {
    flex: 1;
    border: 1px solid #444444;
    background-color: #222222;
  }
</style>`)
	//<link rel="stylesheet" href="http://maxcdn.bootstrapcdn.com/font-awesome/4.3.0/css/font-awesome.min.css">

	doc.WriteString("<div id=\"chart-graph\"></div>\n")
	doc.WriteString("<script type=\"text/javascript\">\n\n")

	doc.WriteString("  var nodes = [\n")
	for _, node := range graph.nodes {
		doc.WriteString("    {\n")
		doc.WriteString(fmt.Sprintf("      id: \"%s\",\n", node.id))
		doc.WriteString(fmt.Sprintf("      label: \"%s\",\n", node.MountPath))
		doc.WriteString(fmt.Sprintf("      group: \"%s\",\n", node.NodeType))
		doc.WriteString("    },\n")
	}
	doc.WriteString("  ];\n\n")

	doc.WriteString("  var edges = [\n")
	for _, edge := range graph.edges {
		doc.WriteString("    {\n")
		doc.WriteString(fmt.Sprintf("      from: \"%s\",\n", edge.upstreamId))
		doc.WriteString(fmt.Sprintf("      to: \"%s\",\n", edge.downstreamId))
		doc.WriteString("      arrows: 'to',\n")
		doc.WriteString("    },\n")
	}
	doc.WriteString("  ];\n\n")

	doc.WriteString(`
  // create a network
  var container = document.getElementById('chart-graph');
  var data = { nodes, edges };
  var options = {
    nodes: {
      shape: 'dot',
      size: 20,
      font: {
        size: 15,
        color: '#ffffff',
      },
      borderWidth: 2,
    },
    edges: {
      width: 2,
    },
    groups: {
      diamonds: {
        color: {
          background: 'red',
          border: 'white',
        },
        shape: 'diamond',
      },
      dotsWithLabel: {
        label: "I'm a dot!",
        shape: 'dot',
        color: 'cyan',
      },
      mints: {
        color: 'rgb(0,255,140)',
      },
      icons: {
        shape: 'icon',
        icon: {
          face: 'FontAwesome',
          code: '\uf0c0',
          size: 50,
          color: 'orange',
        },
      },
      source: {
        color: {
          border: 'white',
        },
      },
    },
  };
  var network = new vis.Network(container, data, options);
`)

	doc.WriteString("</script>\n")

	return inmem.NewFile("visualization.html", doc.Bytes())
}
