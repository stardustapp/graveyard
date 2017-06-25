package main

import "github.com/wenerme/go-rm/rm"

func main() {
	// In case someone try to run this
	rm.Run()
}

func init() {
	rm.Mod = CreateMyMod()
}
func CreateMyMod() *rm.Module {
	mod := rm.NewMod()
	mod.Name = "stardust-kernel"
	mod.Version = 1
	mod.Commands = []rm.Command{CreateCommand_LS()}
	return mod
}
func CreateCommand_LS() rm.Command {
	return rm.Command{
		Usage: "LS key field value",
		Desc: `Sets the 'field' in Hash 'key' to 'value' and returns the previous value, if any.
Reply: String, the previous value or NULL if 'field' didn't exist. `,
		Name:     "ls",
		Flags:    "write fast deny-oom",
		FirstKey: 1, LastKey: 1, KeyStep: 1,
		Action: func(cmd rm.CmdContext) int {
			ctx, args := cmd.Ctx, cmd.Args
			if len(cmd.Args) != 4 {
				return ctx.WrongArity()
			}
			ctx.AutoMemory()
			key, ok := openHashKey(ctx, args[1])
			if !ok {
				return rm.ERR
			}
			// get the current value of the hash element
			var val rm.String
			key.HashGet(rm.HASH_NONE, cmd.Args[2], (*uintptr)(&val))
			// set the element to the new value
			key.HashSet(rm.HASH_NONE, cmd.Args[2], cmd.Args[3])
			if val.IsNull() {
				ctx.ReplyWithNull()
			} else {
				ctx.ReplyWithString(val)
			}
			return rm.OK
		},
	}
}

// open the key and make sure it is indeed a Hash and not empty
func openHashKey(ctx rm.Ctx, k rm.String) (rm.Key, bool) {
	key := ctx.OpenKey(k, rm.READ|rm.WRITE)
	if key.KeyType() != rm.KEYTYPE_EMPTY && key.KeyType() != rm.KEYTYPE_HASH {
		ctx.ReplyWithError(rm.ERRORMSG_WRONGTYPE)
		return rm.Key(0), false
	}
	return key, true
}
