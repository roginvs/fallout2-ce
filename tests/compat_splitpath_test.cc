#include "../src/platform_compat.cc"
#include <gtest/gtest.h>

TEST(CompatSplitPathTest, NoDisk)
{
    char drive[COMPAT_MAX_DRIVE];
    char dir[COMPAT_MAX_DIR];
    char fname[COMPAT_MAX_FNAME];
    char ext[COMPAT_MAX_EXT];

    fallout::compat_splitpath("\\path\\without\\disk\\file.txt", drive, dir, fname, ext);

    EXPECT_STREQ("", drive);
    EXPECT_STREQ("\\path\\without\\disk\\", dir);
    EXPECT_STREQ("file", fname);
    EXPECT_STREQ(".txt", ext);
}

TEST(CompatSplitPathTest, NoLeadingBackslash)
{
    char drive[COMPAT_MAX_DRIVE];
    char dir[COMPAT_MAX_DIR];
    char fname[COMPAT_MAX_FNAME];
    char ext[COMPAT_MAX_EXT];

    fallout::compat_splitpath("path\\without\\leading\\file.txt", drive, dir, fname, ext);

    EXPECT_STREQ("", drive);
    EXPECT_STREQ("path\\without\\leading\\", dir);
    EXPECT_STREQ("file", fname);
    EXPECT_STREQ(".txt", ext);
}

TEST(CompatSplitPathTest, DotInFilename)
{
    char drive[COMPAT_MAX_DRIVE];
    char dir[COMPAT_MAX_DIR];
    char fname[COMPAT_MAX_FNAME];
    char ext[COMPAT_MAX_EXT];

    fallout::compat_splitpath("/path/with/dotted.file.txt", drive, dir, fname, ext);

    EXPECT_STREQ("", drive);
    EXPECT_STREQ("/path/with/", dir);
    EXPECT_STREQ("dotted.file", fname);
    EXPECT_STREQ(".txt", ext);
}

TEST(CompatSplitPathTest, SlashInFilename)
{
    char drive[COMPAT_MAX_DRIVE];
    char dir[COMPAT_MAX_DIR];
    char fname[COMPAT_MAX_FNAME];
    char ext[COMPAT_MAX_EXT];

    fallout::compat_splitpath("/path/with/invalid/folder/or/file/name/file/.tx/t", drive, dir, fname, ext);

    EXPECT_STREQ("", drive);
    EXPECT_STREQ("/path/with/invalid/folder/or/file/name/file/.tx/", dir);
    EXPECT_STREQ("t", fname);
    EXPECT_STREQ("", ext);
}

TEST(CompatSplitPathTest, NoExtension)
{
    char drive[COMPAT_MAX_DRIVE];
    char dir[COMPAT_MAX_DIR];
    char fname[COMPAT_MAX_FNAME];
    char ext[COMPAT_MAX_EXT];

    fallout::compat_splitpath("/path/with/noextensionfile", drive, dir, fname, ext);

    EXPECT_STREQ("", drive);
    EXPECT_STREQ("/path/with/", dir);
    EXPECT_STREQ("noextensionfile", fname);
    EXPECT_STREQ("", ext);
}
