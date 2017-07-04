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
	entriesDir, ok := c.ctx.GetFolder("/entries")
	if !ok {
		return nil
	}

	ent := inmem.NewFolderOf("chart",
		inmem.NewFolderOf("manage",
			&chartManageFunc{c},
		).Freeze(),
		inmem.NewFolderOf("browse",
			&chartBrowseFunc{c, entriesDir},
		).Freeze(),
	)

	if ownerName, ok := c.ctx.GetString("/owner-name"); ok {
		ent.Put(ownerName.Name(), ownerName)
	}
	if ownerEmail, ok := c.ctx.GetString("/owner-email"); ok {
		ent.Put(ownerEmail.Name(), ownerEmail)
	}
	if createdDate, ok := c.ctx.GetString("/created-date"); ok {
		ent.Put(createdDate.Name(), createdDate)
	}
	if homeDomain, ok := c.ctx.GetString("/home-domain"); ok {
		ent.Put(homeDomain.Name(), homeDomain)
	}

	return ent.Freeze()
}
