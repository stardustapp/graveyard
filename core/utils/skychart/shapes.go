package main

import (
	"github.com/stardustapp/core/inmem"
)

var entryShape *inmem.Shape = inmem.NewShape(
	inmem.NewFolderOf("mount-entry",
		inmem.NewString("type", "Folder"),
		inmem.NewFolderOf("props",
			inmem.NewString("mount-path", "String"),
			inmem.NewString("device-type", "String"),
			inmem.NewString("device-uri", "String"),
		),
	))
