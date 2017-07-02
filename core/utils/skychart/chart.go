package main

import (
	//"log"
	//"strings"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
)

type Chart struct {
	list *ChartList
	ctx  base.Context
}

func (c *Chart) listMounts() []ChartEntry {
	return nil
}

func (c *Chart) getEntry() base.Entry {
	ownerName, _ := c.ctx.GetString("/owner-name")
	ownerEmail, _ := c.ctx.GetString("/owner-email")

	return inmem.NewFolderOf("chart",
		ownerName,
		ownerEmail,
		inmem.NewFolder("root").Freeze(),
	).Freeze()
}

// pogo
type ChartEntry struct {
	path string
	uri  string
}
