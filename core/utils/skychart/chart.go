package main

import (
	"fmt"

	"github.com/stardustapp/core/base"
)

type Chart struct {
	name   string
	engine *Engine
	ctx    base.Context
}

func (c *Chart) getApi() base.Entry {
	return &chartApi{c}
}

func (c *Chart) String() string {
	if homeDomain, ok := c.ctx.GetString("/home-domain"); ok {
		return fmt.Sprintf("%s/~%s", homeDomain.Get(), c.name)
	}
	return "~" + c.name
}
