package main

import (
	"fmt"

	"github.com/stardustapp/core/base"
)

type Chart struct {
	name     string
	sessions map[string]*session
	engine   *Engine
	ctx      base.Context
}

func (c *Chart) getApi() base.Entry {
	return &chartApi{c}
}

func (c *Chart) String() string {
	if homeDomain, ok := c.ctx.GetString("/home-domain"); ok {
		return fmt.Sprintf("%s@%s", c.name, homeDomain.Get())
	}
	return "~" + c.name
}
