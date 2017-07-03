package main

import (
	//"log"

	"github.com/stardustapp/core/base"
	//"github.com/stardustapp/core/inmem"
)

type chartBrowseFunc struct {
	chart *Chart
	dir   base.Folder
}

var _ base.Function = (*chartBrowseFunc)(nil)

func (e *chartBrowseFunc) Name() string {
	return "mount"
}

func (e *chartBrowseFunc) Invoke(ctx base.Context, input base.Entry) (output base.Entry) {
	// TODO: assemble a DAG and inflate all the names
	return nil
}
