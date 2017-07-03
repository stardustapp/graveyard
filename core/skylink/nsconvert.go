package skylink

import (
	"log"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
)

// The driver doesn't have access to the router by default
// So the router recursively flattens inputs into a serializable format
// Only works with data, not functionality, and makes copies
// Outputs should instead be linked to the remote in most cases
// Passing linked-from-remote entries as inputs shouldn't send the data back

func convertEntryToApi(root base.Entry) *nsEntry {
	if root == nil {
		return nil
	}
	switch root := root.(type) {

	case base.Folder:
		names := root.Children()
		children := make([]nsEntry, 0, len(names))
		for _, name := range names {
			if child, ok := root.Fetch(name); ok {
				if converted := convertEntryToApi(child); converted != nil {
					children = append(children, *converted)
				}
			}
		}
		return &nsEntry{
			Name:     root.Name(),
			Type:     "Folder",
			Children: children,
		}

	case base.String:
		return &nsEntry{
			Name:        root.Name(),
			Type:        "String",
			StringValue: root.Get(),
		}

	case base.File:
		return &nsEntry{
			Name:     root.Name(),
			Type:     "File",
			FileData: root.Read(0, int(root.GetSize())),
		}

	// TODO: return Links to rich objects like Channels

	default:
		log.Println("Unable to convert entry", root, "to nsapi")
		return nil
	}
}

func convertEntryFromApi(root *nsEntry) base.Entry {
	if root == nil {
		return nil
	}
	switch root.Type {

	case "Folder":
		folder := inmem.NewFolder(root.Name)
		for _, child := range root.Children {
			folder.Put(child.Name, convertEntryFromApi(&child))
		}
		return folder //.Freeze()
		// TODO: downstream should clone instead of freezing

	case "String":
		return inmem.NewString(root.Name, root.StringValue)

	case "File":
		return inmem.NewFile(root.Name, root.FileData) //.Freeze()

	default:
		log.Println("Unable to convert entry", root, "from nsapi")
		return nil
	}
}
