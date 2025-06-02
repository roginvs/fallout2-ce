#ifndef TEST_UTILS_H
#define TEST_UTILS_H

#include "define_lite.h"

variable test_suite_errors := 0;
variable test_suite_verbose := false;
variable test_suite_assertions := 0;

procedure assertEquals(variable desc, variable a, variable b) begin
   test_suite_assertions++;

   if (a != b or typeof(a) != typeof(b)) then begin
      display_msg("Assertion failed \""+desc+"\": "+a+" != "+b);
      test_suite_errors ++;
   end else if (test_suite_verbose) then begin
      display_msg("Assert \""+desc+"\" ok");
   end
end

procedure assertNotEquals(variable desc, variable a, variable b) begin
   test_suite_assertions++;

   if (a == b) then begin
      display_msg("Assertion failed \""+desc+"\": "+a+" == "+b);
      test_suite_errors ++;
   end else if (test_suite_verbose) then begin
      display_msg("Assert \""+desc+"\" ok");
   end
end



procedure report_test_results(variable desc) begin
   
   display_msg("DONE " + desc + " " + 
     (test_suite_assertions-test_suite_errors) + "/" + test_suite_assertions + "");
   display_msg("================");

   #define TEST_CASES "TstCases"
   #define TEST_ASSERTIONS_TOTAL "TestTota"
   #define TEST_ASSERTIONS_FAILED "TestFail"

   //set_sfall_global("test_suite_errors", test_suite_errors);
   variable gl_cases = get_sfall_global_int(TEST_CASES);
   variable gl_assertions_total = get_sfall_global_int(TEST_ASSERTIONS_TOTAL);
   variable gl_assertions_failed = get_sfall_global_int(TEST_ASSERTIONS_FAILED);
   gl_cases += 1;
   gl_assertions_total = gl_assertions_total + test_suite_assertions;
   gl_assertions_failed = gl_assertions_failed + test_suite_errors;
   set_sfall_global(TEST_CASES, gl_cases);
   set_sfall_global(TEST_ASSERTIONS_TOTAL, gl_assertions_total);
   set_sfall_global(TEST_ASSERTIONS_FAILED, gl_assertions_failed);

   if (gl_assertions_failed == 0) then begin
      float_msg(dude_obj, "Tested " + gl_cases + " cases, " +
          (gl_assertions_total-gl_assertions_failed) + "/" + gl_assertions_total +
          " assertions passed!", FLOAT_MSG_GREEN);
   end else begin
      float_msg(dude_obj, "Tested " + gl_cases + " cases, " +
          (gl_assertions_total-gl_assertions_failed) + "/" + gl_assertions_total +
           " assertions passed", FLOAT_MSG_RED);
   end
end

#endif
