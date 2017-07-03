package main

import (
	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
)

type Chart struct {
	list *ChartList
	ctx  base.Context
}

func (c *Chart) getEntry() base.Entry {
	ownerName, _ := c.ctx.GetString("/owner-name")
	ownerEmail, _ := c.ctx.GetString("/owner-email")
  nameDir, ok := c.ctx.GetFolder("/names")
  if !ok {
    return nil
  }

	return inmem.NewFolderOf("chart",
		ownerName,
		ownerEmail,
    inmem.NewFolderOf("manage",
      &chartManageFunc{c, nameDir},
    ).Freeze(),
    inmem.NewFolderOf("browse",
      &mountBrowseFunc{c, nameDir},
    ).Freeze(),
	).Freeze()
}
