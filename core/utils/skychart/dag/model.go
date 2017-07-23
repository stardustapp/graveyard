package dag

import (
	"github.com/stardustapp/core/base"
)

type Graph struct {
	name  string
	nodes map[string]*Node
	edges map[string]*Edge
}

type Node struct {
	Id       string
	NodeType string

	// as configured
	MountPath   string
	DeviceType  string
	DeviceUri   string
	DeviceInput base.Entry
}

type Edge struct {
	id           string
	upstreamId   string
	downstreamId string
}
