CURRENT_LOADER.attachModel(async build => {
  await build.withFieldTypes('structural');

  build.node('Mount', {
    relations: [
      { kind: 'top' },
      { subject: 'Directory', predicate: 'REFERENCES' },
      { subject: 'File', predicate: 'REFERENCES' },
    ],
    fields: {
      Anchor: { anyOfKeyed: {
        HostPath: String,
      }},
      AllowWrites: Boolean,
      Root: { reference: 'Directory',
        defaultValue: { Path: '.' },
      },
    },
  });

  const EntryMetaSlots = { anyOfKeyed: {
    Unknown: Boolean,
    ErrorCode: String,

    // https://nodejs.org/api/fs.html#fs_class_fs_stats
    Posix: { fields: {
      FileType: String, // BlockDevice, CharacterDevice, Directory, FIFO, File, Socket, SymbolicLink
      Device: Number,
      Inode: Number,
      Mode: Number,
      NumLinks: Number,
      UserId: Number,
      GroupId: Number,
      SpecialDevice: Number,
      ByteSize: Number,
      BlockSize: Number,
      Blocks: Number,

      AccessTime: Date,
      ModifyTime: Date,
      ChangeTime: Date,
      BirthTime: Date,
    }},

    // https://developer.mozilla.org/en-US/docs/Web/API/Metadata
    Web: { fields: {
      ModifyTime: Date,
      ByteSize: Number,
    }},
  },
    defaultValue: { Unknown: true },
  };

  build.node('Directory', {
    relations: [
      { subject: 'Mount', predicate: 'HOSTS' },
    ],
    fields: {
      Mount: { reference: 'Mount', optional: true },
      Path: String,
      Meta: EntryMetaSlots,
    },
  });

  build.node('File', {
    relations: [
      { subject: 'Mount', predicate: 'HOSTS' },
    ],
    fields: {
      Mount: { reference: 'Mount', optional: true },
      Path: String,
      Meta: EntryMetaSlots,
    },
  });

});
