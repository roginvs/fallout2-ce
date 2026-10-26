// Build-time information. CMake substitutes the @VARIABLES@ with
// configure_file(@ONLY) into the build output directory. The file is also
// valid JavaScript as-is, so the os/web devserver works without substitution
// (release-like defaults; URL parameters still override them).
export const WEB_COMMIT_HASH = "@WEB_COMMIT_HASH@";
export const WEB_COMMIT_SHORT_HASH = "@HASH@";
export const WEB_COMMIT_DATE = "@WEB_COMMIT_DATE@";

/** 1 in debug builds (CMAKE_BUILD_TYPE != Release), 0 in release builds. */
export const DEBUG_BUILD = Number("@WEB_DEBUG_BUILD@") === 1;
