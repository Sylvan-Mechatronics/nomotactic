// Minimal stand-in for expo-file-system's File: a Blob that remembers its URI.
class File extends Blob {
  constructor(uri) {
    super(["audio-bytes"], { type: "audio/mp4" });
    this.uri = uri;
  }
}

module.exports = { File };
