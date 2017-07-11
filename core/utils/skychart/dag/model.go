package dag

type Graph struct {
	name  string
	nodes map[string]*Node
	edges map[string]*Edge
}

type Node struct {
	id       string
	NodeType string

	// as configured
	MountPath  string
	DeviceType string
	DeviceUri  string
}

type Edge struct {
	id           string
	upstreamId   string
	downstreamId string
}
