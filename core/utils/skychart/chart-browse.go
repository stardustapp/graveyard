package main

import (
	//"log"

	"github.com/stardustapp/core/base"
	//"github.com/stardustapp/core/inmem"
)

type mountBrowseFunc struct {
  chart *Chart
  dir base.Folder
}

var _ base.Function = (*mountBrowseFunc)(nil)

func (e *mountBrowseFunc) Name() string {
	return "mount"
}

func (e *mountBrowseFunc) Invoke(ctx base.Context, input base.Entry) (output base.Entry) {
  // TODO: assemble a DAG and inflate all the names
  return nil
}
