build.as("Data.Struct")

build.fields({
  FileType="String", -- BlockDevice, CharacterDevice, Directory, FIFO, File, Socket, SymbolicLink
  Device="Number",
  Inode="Number",
  Mode="Number",
  NumLinks="Number",
  UserId="Number",
  GroupId="Number",
  SpecialDevice="Number",
  ByteSize="Number",
  BlockSize="Number",
  Blocks="Number",

  AccessTime="Date",
  ModifyTime="Date",
  ChangeTime="Date",
  BirthTime="Date",
})
