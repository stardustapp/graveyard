package main

import (
	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
)

type Chart struct {
	name string
	list *ChartList
	ctx  base.Context
}

func (c *Chart) getEntry() base.Entry {
	ownerName, _ := c.ctx.GetString("/owner-name")
	ownerEmail, _ := c.ctx.GetString("/owner-email")
	createdDate, _ := c.ctx.GetString("/created-date")
	homeDomain, _ := c.ctx.GetString("/home-domain")
	entriesDir, ok := c.ctx.GetFolder("/entries")
	if !ok {
		return nil
	}

	return inmem.NewFolderOf("chart",
		ownerName,
		ownerEmail,
		createdDate,
		homeDomain,
		inmem.NewFolderOf("manage",
			&chartManageFunc{c, entriesDir},
		).Freeze(),
		inmem.NewFolderOf("browse",
			&chartBrowseFunc{c, entriesDir},
		).Freeze(),
	).Freeze()
}
